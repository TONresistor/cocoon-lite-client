#include "td/actor/actor.h"
#include "td/net/FramedPipe.h"
#include "td/net/SslStream.h"
#include "utils.h"

#include "td/net/Socks5.h"
namespace cocoon {

td::Result<td::SslStream> create_server_ssl_stream(tdx::CertAndKey cert_and_key, tdx::PolicyRef policy) {
  auto verify_callback = tdx::VerifyCallbackBuilder::from_policy(std::move(policy));
  TRY_RESULT(ssl_ctx_holder,
             tdx::create_ssl_ctx({tdx::SslOptions::Mode::Server, std::move(cert_and_key), verify_callback}));
  TRY_RESULT(ssl_ctx, td::SslCtx::create(ssl_ctx_holder.release()));
  return td::SslStream::create_server(std::move(ssl_ctx));
}

td::Result<td::SslStream> create_client_ssl_stream(td::CSlice host, tdx::CertAndKey cert_and_key, tdx::PolicyRef policy,
                                                   bool enable_sni) {
  auto verify_callback = tdx::VerifyCallbackBuilder::from_policy(std::move(policy));
  TRY_RESULT(ssl_ctx_holder,
             tdx::create_ssl_ctx({tdx::SslOptions::Mode::Client, std::move(cert_and_key), verify_callback}));
  TRY_RESULT(ssl_ctx, td::SslCtx::create(ssl_ctx_holder.release()));
  return td::SslStream::create(host, std::move(ssl_ctx), enable_sni);
}
td::actor::StartedTask<td::BufferedFd<td::SocketFd>> socks5(td::SocketFd socket_fd, td::IPAddress dest,
                                                            td::string username, td::string password) {
  class Callback : public td::Socks5::Callback {
   public:
    void on_connected() override {
      LOG(INFO) << "connected to socks5 proxy";
    }
  };

  return td::spawn_task_actor<td::Socks5>("Socks5Client", std::move(socket_fd), dest, username, password,
                                          td::make_unique<Callback>(), td::actor::ActorShared<>());
}
class ProxyWorker : public td::TaskActor<td::Unit> {
 public:
  ProxyWorker(td::Pipe left, td::Pipe right) : left_(std::move(left)), right_(std::move(right)) {
  }

  void start_up() override {
    left_.subscribe();
    right_.subscribe();
  }

  td::actor::Task<Action> task_loop_once() override {
    co_await left_.flush_read();
    co_await right_.flush_read();
    // LOG(INFO) << "left=" << left_.input_buffer().size() << " right=" << right_.input_buffer().size();
    proxy_sockets(left_, right_);
    proxy_sockets(right_, left_);
    co_await left_.flush_write();
    co_await right_.flush_write();
    co_return Action::KeepRunning;
  }

  td::actor::Task<td::Unit> finish(td::Status status) override {
    co_await std::move(status);
    co_return td::Unit{};
  }

 private:
  td::Pipe left_;
  td::Pipe right_;
};

td::actor::StartedTask<td::Unit> proxy(td::Slice name, td::Pipe left, td::Pipe right) {
  return td::spawn_task_actor<ProxyWorker>(PSLICE() << "ProxyWorker" << name, std::move(left), std::move(right));
}

class TlsPipeWorker : public td::actor::Actor {
 public:
  TlsPipeWorker(td::Pipe left, td::SslStream left_ssl_stream)
      : left_inner_(std::move(left))
      , left_ssl_(left_inner_.input_buffer(), left_inner_.output_buffer(), std::move(left_ssl_stream)) {
  }
  td::Pipe extract_fd() {
    CHECK(right_);
    return std::move(right_);
  }

 private:
  void start_up() override {
    left_inner_.subscribe();
    auto [fd, observer] = make_pipe(std::move(left_ssl_.input_buffer()), std::move(left_ssl_.output_buffer()));
    observer_ = std::move(observer);
    right_ = std::move(fd);
  }

  td::Status run() {
    TRY_STATUS(left_ssl_.loop());
    // TODO: do not notify on ALL loops
    observer_.notify();
    return td::Status::OK();
  }

  td::Status do_loop() {
    TRY_STATUS(loop_read("left", left_inner_));
    // LOG(INFO) << "left=" << left_ssl_.input_buffer().size();
    TRY_STATUS(run());
    TRY_STATUS(loop_write("left", left_inner_));
    return td::Status::OK();
  }

  void loop() override {
    if (auto s = do_loop(); s.is_error()) {
      stop();
    }
  }

  td::Pipe left_inner_;
  td::SslStreamHelper left_ssl_;

  td::Pipe right_;
  td::Observer observer_;
};

struct PolicyHelper : tdx::Policy {
  explicit PolicyHelper(tdx::PolicyRef inner_policy,
                        td::actor::StartedTask<AttestedPeerInfo>::ExternalPromise peer_info_promise,
                        const td::IPAddress &source, const td::IPAddress &destination)
      : inner_policy_(std::move(inner_policy))
      , peer_info_promise_(std::move(peer_info_promise))
      , source_(source)
      , destination_(destination) {
  }
  td::Result<tdx::AttestationData> validate(const tdx::Quote *quote,
                                            const tdx::UserClaims &user_claims) const override {
    auto r_attestation = inner_policy_->validate(quote, user_claims);
    if (r_attestation.is_ok()) {
      auto peer_info = make_attested_peer_info(r_attestation.ok(), user_claims, source_, destination_);
      peer_info_promise_.set_value(std::move(peer_info));
    } else {
      peer_info_promise_.set_error(r_attestation.error().clone());
    }
    return r_attestation;
  }

 private:
  tdx::PolicyRef inner_policy_;
  mutable td::actor::StartedTask<AttestedPeerInfo>::ExternalPromise peer_info_promise_;
  td::IPAddress source_;
  td::IPAddress destination_;
};

td::actor::Task<std::pair<td::Pipe, AttestedPeerInfo>> wrap_tls_client(td::Slice name, td::Pipe pipe,
                                                                       tdx::CertAndKey cert_and_key,
                                                                       tdx::PolicyRef policy,
                                                                       const td::IPAddress &source,
                                                                       const td::IPAddress &destination) {
  auto [t_peer_info, p_peer_info] = td::actor::StartedTask<AttestedPeerInfo>::make_bridge();
  auto new_policy = std::make_shared<PolicyHelper>(std::move(policy), std::move(p_peer_info), source, destination);

  auto ssl_stream =
      co_await create_client_ssl_stream("127.0.0.1", std::move(cert_and_key), std::move(new_policy), true);
  auto proxy = td::actor::create_actor<TlsPipeWorker>(PSLICE() << "TlsPipeWorker" << name, std::move(pipe),
                                                      std::move(ssl_stream))
                   .release();
  auto peer_info = co_await std::move(t_peer_info);
  auto tls_pipe = co_await ask(proxy, &TlsPipeWorker::extract_fd);
  co_return std::make_pair(std::move(tls_pipe), std::move(peer_info));
}

td::actor::Task<std::pair<td::Pipe, AttestedPeerInfo>> wrap_tls_server(td::Slice name, td::Pipe pipe,
                                                                       tdx::CertAndKey cert_and_key,
                                                                       tdx::PolicyRef policy,
                                                                       const td::IPAddress &source,
                                                                       const td::IPAddress &destination) {
  auto [t_peer_info, p_peer_info] = td::actor::StartedTask<AttestedPeerInfo>::make_bridge();
  auto new_policy = std::make_shared<PolicyHelper>(std::move(policy), std::move(p_peer_info), source, destination);

  auto ssl_stream = co_await create_server_ssl_stream(std::move(cert_and_key), std::move(new_policy));
  auto proxy = td::actor::create_actor<TlsPipeWorker>(PSLICE() << "TlsPipeWorker" << name, std::move(pipe),
                                                      std::move(ssl_stream))
                   .release();
  auto peer_info = co_await std::move(t_peer_info);
  auto tls_pipe = co_await ask(proxy, &TlsPipeWorker::extract_fd);
  co_return std::make_pair(std::move(tls_pipe), std::move(peer_info));
}

td::StringBuilder &operator<<(td::StringBuilder &sb, const ProxyState &state) {
  sb << state.state_;
  if (state.finished_) {
    sb << " [finished]";
  }
  sb << " " << state.short_desc();
  if (state.status.is_error()) {
    sb << " " << state.status;
  }
  return sb;
}

AttestedPeerInfo make_attested_peer_info(const tdx::AttestationData &attestation, const tdx::UserClaims &user_claims,
                                         const td::IPAddress &source, const td::IPAddress &destination) {
  AttestedPeerInfo info;
  info.attestation_data = attestation;
  info.user_claims = user_claims;
  info.source_ip = source.get_ip_str().str();
  info.source_port = source.get_port();
  info.destination_ip = destination.get_ip_str().str();
  info.destination_port = destination.get_port();
  return info;
}

td::StringBuilder &operator<<(td::StringBuilder &sb, const AttestedPeerInfo &info) {
  sb << "AttestedPeerInfo{";
  sb << "src=" << info.source_ip << ":" << info.source_port;
  sb << ", dst=" << info.destination_ip << ":" << info.destination_port;
  sb << ", type=" << info.attestation_data.short_description();

  // Show short image hash instead of full attestation data
  if (!info.attestation_data.is_empty()) {
    auto hash = info.attestation_data.image_hash();
    sb << ", image_hash=" << td::hex_encode(hash.as_slice()).substr(0, 16) << "..";
  }

  // Show public key (uses operator<< which already formats it nicely)
  sb << ", pubkey=" << info.user_claims.public_key;
  sb << "}";
  return sb;
}
}  // namespace cocoon