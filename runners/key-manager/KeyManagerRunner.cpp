#include "KeyManagerRunner.hpp"

#include "Ed25519.h"
#include "common/bitstring.h"
#include "errorcode.h"
#include "td/actor/actor.h"
#include "td/utils/Random.h"
#include "td/utils/SharedSlice.h"
#include "td/utils/common.h"
#include "td/utils/filesystem.h"
#include "td/db/RocksDb.h"
#include "td/utils/misc.h"
#include "td/utils/overloaded.h"

#include "cocoon-tl-utils/cocoon-tl-utils.hpp"
#include "git.h"

#include "auto/tl/cocoon_api_json.h"
#include "auto/tl/cocoon_api.h"
#include "auto/tl/cocoon_api.hpp"
#include "td/utils/port/Clocks.h"
#include "tl/TlObject.h"
#include <memory>

namespace cocoon {

void KeyManagerRunner::load_config(td::Promise<td::Unit> promise) {
  auto S = [&]() -> td::Status {
    TRY_RESULT_PREFIX(conf_data, td::read_file(engine_config_filename()), "failed to read: ");
    TRY_RESULT_PREFIX(conf_json, td::json_decode(conf_data.as_slice()), "failed to parse json: ");

    cocoon::cocoon_api::keyStorageRunner_config conf;
    TRY_STATUS_PREFIX(cocoon::cocoon_api::from_json(conf, conf_json.get_object()), "json does not fit TL scheme: ");
    set_testnet(conf.is_testnet_);
    if (conf.http_port_) {
      set_http_port((td::uint16)conf.http_port_);
    }
    set_rpc_port((td::uint16)conf.rpc_port_, remote_app_type_unknown());

    TRY_RESULT_PREFIX(rc_address, block::StdAddress::parse(conf.root_contract_address_),
                      "cannot parse root contract address: ");
    rc_address.testnet = is_testnet();
    set_root_contract_address(rc_address);

    if (conf.ton_config_filename_.size() > 0) {
      set_ton_config_filename(conf.ton_config_filename_);
    }

    private_key_ =
        std::make_unique<td::Ed25519::PrivateKey>(td::SecureString(conf.machine_specific_private_key_.as_slice()));
    public_key_.as_slice().copy_from(private_key_->get_public_key().move_as_ok().as_octet_string());

    public_key_obj_ = std::make_unique<td::Ed25519::PublicKey>(
        td::Ed25519::PublicKey::from_slice(public_key_.as_slice()).move_as_ok());

    if (conf.check_hashes_ || !conf.is_test_) {
      set_fake_tdx(false);
      enable_check_hashes();
    } else {
      set_fake_tdx(true);
    }
    set_http_access_hash(conf.http_access_hash_);
    set_is_test(conf.is_test_);

    db_path_ = conf.db_path_;
    if (!is_test()) {
      CHECK(!is_testnet());
    }

    return td::Status::OK();
  }();
  if (S.is_error()) {
    promise.set_error(std::move(S));
  } else {
    promise.set_value(td::Unit());
  }
}

void KeyManagerRunner::custom_initialize(td::Promise<td::Unit> promise) {
  kv_ = std::make_shared<td::RocksDb>(td::RocksDb::open(db_path_).move_as_ok());

  {
    td::UniqueSlice value = get_from_db("config");

    if (value.size() > 0) {
      auto obj = cocoon::fetch_tl_object<cocoon_api::keyManagerDb_Config>(value.as_slice(), true).move_as_ok();

      cocoon_api::downcast_call(*obj, td::overloaded([&](cocoon_api::keyManagerDb_configEmpty &c) { UNREACHABLE(); },
                                                     [&](cocoon_api::keyManagerDb_configV1 &c) {
                                                       CHECK(runner_config()->root_contract_config->version() >=
                                                             (td::uint32)c.root_contract_version_);
                                                       active_config_version_ = c.root_contract_version_;
                                                     }));
    } else {
      active_config_version_ = 0;
    }
  }

  auto snap = kv_->snapshot();
  snap->for_each([&](td::Slice key, td::Slice value) -> td::Status {
    process_db_key(key, value);
    return td::Status::OK();
  });

  register_custom_http_handler(
      "/stats",
      [&](std::string url, std::map<std::string, std::string> get_args, std::unique_ptr<ton::http::HttpRequest> request,
          std::shared_ptr<ton::http::HttpPayload> payload,
          td::Promise<std::pair<std::unique_ptr<ton::http::HttpResponse>, std::shared_ptr<ton::http::HttpPayload>>>
              promise) { http_send_static_answer(http_generate_main(), std::move(promise)); });
  register_custom_http_handler(
      "/request/removekey",
      [&](std::string url, std::map<std::string, std::string> get_args, std::unique_ptr<ton::http::HttpRequest> request,
          std::shared_ptr<ton::http::HttpPayload> payload,
          td::Promise<std::pair<std::unique_ptr<ton::http::HttpResponse>, std::shared_ptr<ton::http::HttpPayload>>>
              promise) {
        if (request->method() != "POST" && request->method() != "post") {
          http_send_static_answer(wrap_short_answer_to_http("removekey must be a post request"), std::move(promise));
        } else {
          http_send_static_answer(http_remove_key(get_args["key"]), std::move(promise));
        }
      });
  register_custom_http_handler(
      "/request/generatekey",
      [&](std::string url, std::map<std::string, std::string> get_args, std::unique_ptr<ton::http::HttpRequest> request,
          std::shared_ptr<ton::http::HttpPayload> payload,
          td::Promise<std::pair<std::unique_ptr<ton::http::HttpResponse>, std::shared_ptr<ton::http::HttpPayload>>>
              promise) {
        if (request->method() != "POST" && request->method() != "post") {
          http_send_static_answer(wrap_short_answer_to_http("generatekey must be a post request"), std::move(promise));
        } else {
          http_send_static_answer(http_generate_key(get_args["type"]), std::move(promise));
        }
      });

  promise.set_value(td::Unit());
}

void KeyManagerRunner::process_db_key(td::Slice key, td::Slice value) {
  auto key_parts = td::split(key, '_');
  auto key_type = key_parts.first;
  key = key_parts.second;

  CHECK(value.size() >= 64);
  auto signature = value.copy().remove_prefix(value.size() - 64);
  value.remove_suffix(64);

  public_key_obj_->verify_signature(value, signature).ensure();

  if (key_type == "key") {
    auto obj = cocoon::fetch_tl_object<cocoon_api::keyManagerDb_key>(value, true).move_as_ok();

    auto P = std::make_unique<PrivateKey>();
    P->private_key = obj->private_key_;

    P->public_key.as_slice().copy_from(td::Ed25519::PrivateKey(td::SecureString(P->private_key.as_slice()))
                                           .get_public_key()
                                           .move_as_ok()
                                           .as_octet_string());
    CHECK(P->public_key.to_hex() == key);
    P->for_proxies = obj->for_proxies_;
    P->for_workers = obj->for_workers_;
    P->valid_since_ = obj->valid_since_utime_;
    P->valid_until_ = obj->valid_until_utime_;
    P->valid_since_config_version_ = obj->valid_since_config_version_;
    CHECK(active_config_version_ >= (td::uint32)P->valid_since_config_version_);

    if ((td::uint32)P->valid_until_ > td::Clocks::system()) {
      private_keys_.push_back(std::move(P));
    }
  } else if (key_type == "config") {
  } else {
    LOG(FATAL) << "unknown key type in db: " << key;
  }
}

void KeyManagerRunner::config_to_db() {
  auto conf = cocoon::create_serialize_tl_object<cocoon_api::keyManagerDb_configV1>(
      runner_config()->root_contract_config->version());
  set_to_db("config", std::move(conf));
}

td::UniqueSlice KeyManagerRunner::get_from_db(td::Slice key) {
  std::string config_value;
  auto k = kv_->get(key, config_value);
  k.ensure();

  if (k.move_as_ok() == td::KeyValue::GetStatus::Ok) {
    auto value = td::Slice(config_value);
    CHECK(value.size() >= 64);
    auto signature = value.copy().remove_prefix(value.size() - 64);
    value.remove_suffix(64);

    public_key_obj_->verify_signature(value, signature).ensure();

    return td::UniqueSlice(value);
  } else {
    return td::UniqueSlice();
  }
}

void KeyManagerRunner::set_to_db(td::Slice key, td::Slice value) {
  td::UniqueSlice signed_value(value.size() + 64);
  auto signature = private_key_->sign(value).move_as_ok();
  auto S = signed_value.as_mutable_slice();
  S.copy_from(value);
  S.remove_prefix(value.size());
  S.copy_from(signature.as_slice());
  S.remove_prefix(signature.size());
  CHECK(!S.size());
  kv_->set(key, signed_value.as_slice()).ensure();
}

void KeyManagerRunner::alarm() {
  BaseRunner::alarm();

  if (is_initialized()) {
    return;
  }

  kv_->begin_transaction().ensure();
  if (runner_config()->root_contract_config->version() > active_config_version_) {
    active_config_version_ = runner_config()->root_contract_config->version();
    config_to_db();
  }
  td::int32 w_cnt = 0, p_cnt = 0;
  for (auto it = private_keys_.begin(); it != private_keys_.end();) {
    if ((*it)->valid_until_ < td::Clocks::system()) {
      kv_->erase(PSTRING() << "key_" << (*it)->public_key.to_hex());
      it = private_keys_.erase(it);
    } else {
      if ((*it)->for_proxies) {
        p_cnt++;
      }
      if ((*it)->for_workers) {
        w_cnt++;
      }
      it++;
    }
  }
  if (w_cnt == 0) {
    generate_key(false, true);
  }
  if (p_cnt == 0) {
    generate_key(true, false);
  }
  kv_->commit_transaction().ensure();
  kv_->flush().ensure();
}

void KeyManagerRunner::receive_message(TcpClient::ConnectionId connection_id, td::BufferSlice query) {
}

void KeyManagerRunner::receive_query(TcpClient::ConnectionId connection_id, td::BufferSlice query,
                                     td::Promise<td::BufferSlice> promise) {
  if (!is_initialized()) {
    return;
  }
  auto conn = static_cast<BaseInboundConnection *>(get_connection(connection_id));
  if (!conn) {
    return;
  }

  auto magic = get_tl_magic(query);
  switch (magic) {
    case cocoon_api::keyManager_getProxyPrivateKeys::ID: {
      if (check_hashes_ && !runner_config()->root_contract_config->has_proxy_hash(conn->remote_app_hash())) {
        return promise.set_error(td::Status::Error(ton::ErrorCode::error, "unknown proxy hash"));
      }
      std::vector<ton::tl_object_ptr<cocoon_api::keyManager_privateKey>> pks;
      for (auto &k : private_keys_) {
        if (k->for_proxies) {
          pks.push_back(ton::create_tl_object<cocoon_api::keyManager_privateKey>(k->valid_until_, k->private_key));
        }
      }
      promise.set_value(cocoon::create_serialize_tl_object<cocoon_api::keyManager_privateKeys>(std::move(pks)));
      return;
    }
    case cocoon_api::keyManager_getWorkerPrivateKeys::ID: {
      if (check_hashes_ && !runner_config()->root_contract_config->has_worker_hash(conn->remote_app_hash())) {
        return promise.set_error(td::Status::Error(ton::ErrorCode::error, "unknown worker hash"));
      }
      std::vector<ton::tl_object_ptr<cocoon_api::keyManager_privateKey>> pks;
      for (auto &k : private_keys_) {
        if (k->for_workers) {
          pks.push_back(ton::create_tl_object<cocoon_api::keyManager_privateKey>(k->valid_until_, k->private_key));
        }
      }
      promise.set_value(cocoon::create_serialize_tl_object<cocoon_api::keyManager_privateKeys>(std::move(pks)));
      return;
    }
    default:
      LOG(ERROR) << "received query with unknown magic " << td::format::as_hex(magic);
      promise.set_error(td::Status::Error(ton::ErrorCode::failure, "unknown query magic"));
  }
}

void KeyManagerRunner::receive_http_request(
    std::unique_ptr<ton::http::HttpRequest> request, std::shared_ptr<ton::http::HttpPayload> payload,
    td::Promise<std::pair<std::unique_ptr<ton::http::HttpResponse>, std::shared_ptr<ton::http::HttpPayload>>> promise) {
  ton::http::answer_error(ton::http::HttpStatusCode::status_bad_request, "bad request", std::move(promise));
}

void KeyManagerRunner::remove_key(td::Bits256 public_key) {
  for (auto it = private_keys_.begin(); it != private_keys_.end(); it++) {
    if ((*it)->public_key == public_key) {
      kv_->erase(PSTRING() << "key_" << (*it)->public_key.to_hex());
      private_keys_.erase(it);
      return;
    }
  }
}

void KeyManagerRunner::generate_key(bool for_proxies, bool for_workers) {
  td::SecureString s(32);
  td::Random::secure_bytes(s.as_mutable_slice());
  td::Ed25519::PrivateKey pk(std::move(s));
  auto pub = pk.get_public_key().move_as_ok();

  auto P = std::make_unique<PrivateKey>();
  P->for_proxies = for_proxies;
  P->for_workers = for_workers;
  P->private_key.as_slice().copy_from(pk.as_octet_string().as_slice());
  P->public_key.as_slice().copy_from(pub.as_octet_string().as_slice());
  P->valid_since_ = (td::int32)td::Clocks::system();
  P->valid_until_ = P->valid_since_ + key_ttl();
  P->valid_since_config_version_ = active_config_version_;

  set_to_db(PSTRING() << "key_" << P->public_key.to_hex(),
            cocoon::create_serialize_tl_object<cocoon_api::keyManagerDb_key>(
                P->private_key, P->for_workers, P->for_proxies, P->valid_since_config_version_, P->valid_since_,
                P->valid_until_));

  private_keys_.push_back(std::move(P));
}

std::string KeyManagerRunner::http_generate_main() {
  td::StringBuilder sb;
  sb << "<!DOCTYPE html>\n";
  sb << "<html><body>\n";
  {
    sb << "<h1>STATUS</h1>\n";
    sb << "<table>\n";
    if (cocoon_wallet()) {
      sb << "<tr><td>wallet</td><td>";
      if (cocoon_wallet()->balance() < min_wallet_balance()) {
        sb << "<span style=\"background-color:Crimson;\">balance too low on "
           << address_link(cocoon_wallet()->address()) << "</span>";
      } else if (cocoon_wallet()->balance() < warning_wallet_balance()) {
        sb << "<span style=\"background-color:Gold;\">balance low on " << address_link(cocoon_wallet()->address())
           << "</span>";
      } else {
        sb << "<span style=\"background-color:Green;\">balance ok on " << address_link(cocoon_wallet()->address())
           << "</span>";
      }
      sb << "</td></tr>\n";
    }
    {
      sb << "<tr><td>image</td><td>";
      sb << "<span style=\"background-color:Gold;\">cannot check our hash " << local_image_hash_unverified_.to_hex()
         << "</span>";
      sb << "</td></tr>\n";
    }
    auto r = runner_config();
    if (r) {
      auto ts = (int)std::time(0);
      sb << "<tr><td>ton</td><td>";
      if (ts - r->root_contract_ts < 600) {
        sb << "<span style=\"background-color:Green;\">synced</span>";
      } else if (ts - r->root_contract_ts < 3600) {
        sb << "<span style=\"background-color:Gold;\">late</span>";
      } else {
        sb << "<span style=\"background-color:Crimson;\">out of sync</span>";
      }
      sb << "</td></tr>\n";
    }
    sb << "<tr><td>enabled</td><td>";
    sb << "</td></tr>\n";
    sb << "<tr><td>version</td><td>commit " << GitMetadata::CommitSHA1() << " at " << GitMetadata::CommitDate()
       << "</td></tr>\n";
    sb << "</table>\n";
  }
  store_wallet_stat(sb);
  store_root_contract_stat(sb);
  {
    sb << "<h1>KEYS</h1>\n";
    sb << "<table>\n";
    sb << "<tr><td>key</td><td>for proxies</td><td>for workers</td><td>valid since config version</td><td>valid "
          "since</td><td>valid until</td></tr>\n";
    for (auto &it : private_keys_) {
      const auto &k = *it;
      sb << "<tr><td>" << k.public_key.to_hex() << "</td><td>" << (k.for_proxies ? "YES" : "NO") << "</td><td>"
         << (k.for_workers ? "YES" : "NO") << "</td><td>" << k.valid_since_config_version_ << "</td><td>"
         << k.valid_since_ << "</td><td>" << k.valid_until_ << "</td></tr>\n";
    }
    sb << "</table>\n";
  }
  sb << "</body></html>\n";
  return sb.as_cslice().str();
}

std::string KeyManagerRunner::http_generate_json_stats() {
  SimpleJsonSerializer jb;

  jb.start_object();
  {
    jb.start_object("status");
    jb.add_element("actual_image_hash", true);
    auto r = runner_config();
    if (r) {
      jb.add_element("ton_last_synced_at", r->root_contract_ts);
    }
    jb.add_element("git_commit", GitMetadata::CommitSHA1());
    jb.add_element("git_commit_data", GitMetadata::CommitDate());
    jb.stop_object();
  }
  {
    jb.start_object("localconfig");
    jb.add_element("check_hashes", check_hashes_);
    jb.stop_object();
  }
  store_root_contract_stat(jb);

  jb.stop_object();

  return jb.as_cslice().str();
}

std::string KeyManagerRunner::http_remove_key(std::string pub_key) {
  auto R = td::hex_decode(pub_key);
  if (R.is_error()) {
    return wrap_short_answer_to_http(PSTRING() << "cannot decode hex: " << R.move_as_error());
  }
  auto r = R.move_as_ok();
  if (r.size() != 32) {
    return wrap_short_answer_to_http(PSTRING() << "cannot decode hex: public key must be 32 bytes long");
  }
  td::Bits256 p;
  p.as_slice().copy_from(r);
  remove_key(p);
  return wrap_short_answer_to_http(PSTRING() << "key removed");
}

std::string KeyManagerRunner::http_generate_key(std::string key_type) {
  if (key_type == "worker") {
    generate_key(false, true);
  } else if (key_type == "proxy") {
    generate_key(true, false);
  } else if (key_type == "proxyworker") {
    generate_key(true, true);
  } else {
    return wrap_short_answer_to_http(PSTRING() << "unknown key type " << key_type);
  }
  kv_->flush().ensure();
  return wrap_short_answer_to_http(PSTRING() << "key generated");
}

}  // namespace cocoon
