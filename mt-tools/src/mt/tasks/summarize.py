"""Summarization task using XL-Sum dataset and BERTScore metric."""

import json
from typing import List, Optional

from mt.tasks.base import Task, Sample, TaskResult
from mt import TranslateConfig


class SummarizeTask(Task):
    """Summarization task.
    
    Usage:
        task = SummarizeTask(lang="en")
        output = task.run(text, config)
        samples = task.load_eval_data(n=100)
    """
    
    name = "summarize"
    
    # XL-Sum language mapping
    XLSUM_LANGS = {
        "en": "english", "ru": "russian", "zh": "chinese_simplified",
        "es": "spanish", "fr": "french", "de": "german", "ar": "arabic",
        "ja": "japanese", "ko": "korean", "pt": "portuguese", "it": "italian",
        "tr": "turkish", "vi": "vietnamese", "uk": "ukrainian", "hi": "hindi",
        "th": "thai", "id": "indonesian",
    }
    
    def __init__(self, lang: str = "en"):
        """Create summarization task.
        
        Args:
            lang: Language code (e.g., "en", "ru")
        """
        self.lang = lang
    
    def run(self, text: str, config: TranslateConfig) -> TaskResult:
        """Summarize text using the configured model."""
        from mt.translate import detect_prompt_format
        
        prompt = self._build_prompt(text)
        fmt = config.prompt_format
        if fmt == "auto":
            fmt = detect_prompt_format(config.model)
        
        # Use harmony format for gpt-oss models
        if fmt == "harmony":
            return self._run_harmony(text, config)
        
        # Standard chat format
        messages = [
            {"role": "system", "content": "You are a helpful assistant that summarizes text concisely."},
            {"role": "user", "content": prompt}
        ]
        
        if config.use_azure:
            from mt.translate import get_azure_endpoint
            url = get_azure_endpoint()
            model = config.azure_model
        else:
            url = f"{config.endpoint}/v1/chat/completions"
            model = config.model
        
        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0,
        }
        
        # Disable thinking mode for Qwen models
        if "qwen" in model.lower():
            payload["chat_template_kwargs"] = {"enable_thinking": False}
        
        response = config.post(url, payload)
        response.raise_for_status()
        output = response.json()["choices"][0]["message"]["content"].strip()
        return TaskResult(output=output)
    
    def _run_harmony(self, text: str, config: TranslateConfig) -> TaskResult:
        """Run summarization using harmony format for gpt-oss models."""
        prompt_text = self._build_prompt(text)
        
        developer_prompt = """You are a helpful assistant that summarizes text concisely.
Output ONLY the summary, nothing else. No explanations, no notes."""
        
        prompt = (
            "<|start|>system<|message|>You are ChatGPT, a large language model trained by OpenAI.\n"
            "Knowledge cutoff: 2024-06\nReasoning: low\nValid channels: final.<|end|>"
            f"<|start|>developer<|message|>{developer_prompt}<|end|>"
            f"<|start|>user<|message|>{prompt_text}<|end|>"
            "<|start|>assistant<|channel|>analysis<|message|><|end|>"
            "<|start|>assistant<|channel|>analysis<|message|><|end|>"
            "<|start|>assistant<|channel|>analysis<|message|><|end|>"
            "<|start|>assistant<|channel|>final<|message|>"
        )
        
        url = f"{config.endpoint}/v1/completions"
        payload = {
            "model": config.model,
            "prompt": prompt,
            "temperature": 0,
            "max_tokens": 512,
            "skip_special_tokens": False,
            "enable_debug": True,
        }
        
        response = config.post(url, payload)
        response.raise_for_status()
        content = response.json()["choices"][0]["text"].strip()
        
        # Clean harmony tokens
        content = content.split("<|return|>")[0].split("<|end|>")[0].strip()
        return TaskResult(output=content)
    
    def _build_prompt(self, text: str) -> str:
        """Build summarization prompt."""
        max_chars = 4000
        if len(text) > max_chars:
            text = text[:max_chars] + "..."
        
        if self.lang == "en":
            return f"Summarize the following article in 2-3 sentences:\n\n{text}\n\nSummary:"
        else:
            return f"Summarize the following article concisely in the same language ({self.lang}):\n\n{text}\n\nSummary:"

    def load_eval_data(self, n: int = 100) -> List[Sample]:
        """Load summarization evaluation data."""
        from datasets import load_dataset
        
        # For English, use CNN/DailyMail (most reliable)
        # For other languages, try XL-Sum with fallbacks
        if self.lang == "en":
            try:
                ds = load_dataset("cnn_dailymail", "3.0.0", split="test")
                samples = [
                    Sample(
                        input=row["article"],
                        reference=row["highlights"],
                        meta={"lang": self.lang, "id": row.get("id", str(i))}
                    )
                    for i, row in enumerate(ds.select(range(min(n, len(ds)))))
                ]
                return samples
            except Exception as e:
                raise ValueError(f"Failed to load CNN/DailyMail: {e}")
        
        # For other languages, try XL-Sum
        xlsum_lang = self.XLSUM_LANGS.get(self.lang, self.lang)
        try:
            ds = load_dataset("csebuetnlp/xlsum", xlsum_lang, split="test")
        except Exception:
            raise ValueError(f"Summarization eval for '{self.lang}' not supported. Use --lang en")
        
        samples = [
            Sample(
                input=row["text"],
                reference=row["summary"],
                meta={"lang": self.lang, "id": row.get("id", i)}
            )
            for i, row in enumerate(ds.select(range(min(n, len(ds)))))
        ]
        return samples
    
    def compute_scores(self, samples: List[Sample], outputs: List[str]) -> List[Optional[float]]:
        """Compute per-sample BERTScore F1 (multilingual)."""
        from bert_score import score as bert_score
        
        valid_indices = []
        hyps_valid = []
        refs_valid = []
        
        for i, (s, o) in enumerate(zip(samples, outputs)):
            if o:
                valid_indices.append(i)
                hyps_valid.append(o)
                refs_valid.append(s.reference)
        
        if not valid_indices:
            return [None] * len(samples)
        
        P, R, F1 = bert_score(
            hyps_valid, refs_valid,
            lang="xx",  # multilingual
            verbose=False
        )
        
        scores = [None] * len(samples)
        for idx, f1 in zip(valid_indices, F1.tolist()):
            scores[idx] = float(f1)
        
        return scores
    
    def aggregate_scores(self, scores: List[Optional[float]]) -> dict:
        """Aggregate BERTScore F1."""
        valid = [s for s in scores if s is not None]
        if not valid:
            return {"bertscore_f1": None, "n": 0}
        return {"bertscore_f1": sum(valid) / len(valid), "n": len(valid)}
    
    def cache_key(self) -> str:
        """Return cache key for this summarization task."""
        return f"summarize:{self.lang}"
    
    def params_json(self) -> str:
        """Return params as JSON."""
        return json.dumps({"lang": self.lang}, sort_keys=True)
    
    def metric_name(self) -> str:
        """Return metric name for caching."""
        return "bertscore"
    
    def format_progress(self, idx: int, total: int) -> str:
        """Format progress indicator: 'en'."""
        return self.lang
