"""Translation task."""

import json
import threading
from typing import List, Optional, Any, Dict

from mt.tasks.base import Task, Sample, TaskResult
from mt import translate as translate_fn, TranslateConfig


# Language mappings
WMT_LANG_MAP = {
    "ar": "ar_EG", "bg": "bg_BG", "bn": "bn_IN", "ca": "ca_ES", "cs": "cs_CZ",
    "da": "da_DK", "de": "de_DE", "el": "el_GR", "es": "es_MX", "et": "et_EE",
    "fa": "fa_IR", "fi": "fi_FI", "fr": "fr_FR", "he": "he_IL", "hi": "hi_IN",
    "hr": "hr_HR", "hu": "hu_HU", "id": "id_ID", "is": "is_IS", "it": "it_IT",
    "ja": "ja_JP", "ko": "ko_KR", "lt": "lt_LT", "lv": "lv_LV", "nl": "nl_NL",
    "no": "no_NO", "pl": "pl_PL", "pt": "pt_BR", "ro": "ro_RO", "ru": "ru_RU",
    "sk": "sk_SK", "sl": "sl_SI", "sr": "sr_RS", "sv": "sv_SE", "th": "th_TH",
    "tr": "tr_TR", "uk": "uk_UA", "ur": "ur_PK", "vi": "vi_VN", "zh": "zh_CN",
    "zh-CN": "zh_CN", "zh-TW": "zh_TW",
}

LANG_NAMES = {
    "en": "English (en)", "ru": "Russian (ru)", "zh": "Chinese (zh)",
    "zh-CN": "Chinese Simplified (zh-CN)", "zh-TW": "Chinese Traditional (zh-TW)",
    "es": "Spanish (es)", "tr": "Turkish (tr)", "pt": "Portuguese (pt)",
    "ko": "Korean (ko)", "id": "Indonesian (id)", "ar": "Arabic (ar)",
    "fr": "French (fr)", "vi": "Vietnamese (vi)", "ja": "Japanese (ja)",
    "it": "Italian (it)", "fa": "Persian (fa)", "de": "German (de)",
    "uk": "Ukrainian (uk)", "uz": "Uzbek (uz)", "pl": "Polish (pl)",
    "nl": "Dutch (nl)", "he": "Hebrew (he)", "cs": "Czech (cs)",
    "hu": "Hungarian (hu)", "sk": "Slovak (sk)", "sr": "Serbian (sr)",
    "th": "Thai (th)", "hi": "Hindi (hi)", "bn": "Bengali (bn)", "my": "Burmese (my)",
}

# COMET model cache
_COMET_MODEL = None
_COMET_MODEL_NAME = None
_COMET_LOCK = threading.Lock()

COMET_MODELS = {
    "wmt22": "Unbabel/wmt22-comet-da",
    "xcomet-xl": "Unbabel/XCOMET-XL",
    "xcomet-xxl": "Unbabel/XCOMET-XXL",
}


def get_comet_model(model_name: str = "wmt22"):
    """Load COMET model once and cache it."""
    global _COMET_MODEL, _COMET_MODEL_NAME
    
    with _COMET_LOCK:
        if _COMET_MODEL is not None and _COMET_MODEL_NAME != model_name:
            _COMET_MODEL = None
        
        if _COMET_MODEL is None:
            from comet import download_model, load_from_checkpoint
            model_id = COMET_MODELS.get(model_name, model_name)
            print(f"Loading COMET model: {model_id} (one-time)...")
            import warnings
            import logging
            logging.getLogger("pytorch_lightning").setLevel(logging.ERROR)
            logging.getLogger("torch").setLevel(logging.ERROR)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                model_path = download_model(model_id)
                _COMET_MODEL = load_from_checkpoint(model_path)
            _COMET_MODEL_NAME = model_name
            print(f"COMET model loaded: {model_name}\n")
        
        return _COMET_MODEL


def has_gpu() -> bool:
    """Check if GPU is available for COMET."""
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


# Dataset cache to avoid reloading
_DATASET_CACHE: Dict[str, List[Sample]] = {}
_DATASET_CACHE_LOCK = threading.Lock()


class TranslateTask(Task):
    """Translation task.
    
    Usage:
        task = TranslateTask(src="en", tgt="ru")
        output = task.run(text, config)
        samples = task.load_eval_data(n=100)
    """
    
    name = "translate"
    
    def __init__(self, src: str = "en", tgt: str = "en", comet_model: str = "wmt22"):
        """Create translation task.
        
        Args:
            src: Source language code (e.g., "en", "ru")
            tgt: Target language code
            comet_model: COMET model variant (wmt22, xcomet-xl, xcomet-xxl)
        """
        self.src = src
        self.tgt = tgt
        self.comet_model = comet_model
    
    @property
    def target_lang_name(self) -> str:
        """Get full language name for prompting."""
        return LANG_NAMES.get(self.tgt, self.tgt)
    
    def run(self, text: str, config: TranslateConfig) -> TaskResult:
        """Translate text to target language."""
        result = translate_fn(text, self.target_lang_name, config)
        return TaskResult(
            output=result.translation,
            timing=result.timing,
        )
    
    def load_eval_data(self, n: int = 100) -> List[Sample]:
        """Load WMT24++ or FLORES evaluation data."""
        cache_key = f"{self.src}-{self.tgt}:{n}"
        
        with _DATASET_CACHE_LOCK:
            if cache_key in _DATASET_CACHE:
                samples = _DATASET_CACHE[cache_key]
                print(f"Loading data: {self.src}->{self.tgt} (cached, {len(samples)} samples)")
                return [Sample(input=s.input, reference=s.reference, meta=s.meta.copy()) for s in samples]
        
        # Try WMT24++ for en->xx pairs
        if self.src == "en" and self.tgt in WMT_LANG_MAP:
            samples = self._load_wmt_data(n)
        else:
            samples = self._load_flores_data(n)
        
        with _DATASET_CACHE_LOCK:
            _DATASET_CACHE[cache_key] = samples
        
        return [Sample(input=s.input, reference=s.reference, meta=s.meta.copy()) for s in samples]
    
    def _load_wmt_data(self, n: int) -> List[Sample]:
        """Load WMT24++ dataset."""
        from datasets import load_dataset
        
        wmt_tgt = WMT_LANG_MAP.get(self.tgt, self.tgt)
        config = f"en-{wmt_tgt}"
        
        print(f"Loading WMT24++: {config}")
        dataset = load_dataset("google/wmt24pp", config, split="train")
        
        # Filter bad samples
        good_samples = [
            row for row in dataset 
            if not row.get("is_bad_source", False) and len(row["source"]) <= 200
        ]
        print(f"  Filtered: {len(dataset)} -> {len(good_samples)} samples")
        
        samples = []
        for row in good_samples[:n]:
            samples.append(Sample(
                input=row["source"],
                reference=row["target"],
                meta={"src": self.src, "tgt": self.tgt}
            ))
        
        print(f"  Loaded {len(samples)} samples")
        return samples
    
    def _load_flores_data(self, n: int) -> List[Sample]:
        """Load FLORES-200 dataset."""
        from datasets import load_dataset
        
        print(f"Loading FLORES: {self.src}->{self.tgt}")
        
        samples = []
        
        if self.src == "en":
            config = f"en-{self.tgt}"
            dataset = load_dataset("haoranxu/FLORES-200", config, split="test")
            for i, row in enumerate(dataset):
                if i >= n:
                    break
                text = row[config]
                if len(text["en"]) <= 200:
                    samples.append(Sample(
                        input=text["en"],
                        reference=text[self.tgt],
                        meta={"src": self.src, "tgt": self.tgt}
                    ))
        elif self.tgt == "en":
            config = f"{self.src}-en"
            dataset = load_dataset("haoranxu/FLORES-200", config, split="test")
            for i, row in enumerate(dataset):
                if i >= n:
                    break
                text = row[config]
                if len(text[self.src]) <= 200:
                    samples.append(Sample(
                        input=text[self.src],
                        reference=text["en"],
                        meta={"src": self.src, "tgt": self.tgt}
                    ))
        else:
            # Use English pivot
            print(f"  Using English pivot for {self.src}->{self.tgt}")
            config_src = f"{self.src}-en"
            config_tgt = f"en-{self.tgt}"
            
            dataset_src = load_dataset("haoranxu/FLORES-200", config_src, split="test")
            dataset_tgt = load_dataset("haoranxu/FLORES-200", config_tgt, split="test")
            
            for i in range(min(n, len(dataset_src), len(dataset_tgt))):
                src_text = dataset_src[i][config_src][self.src]
                tgt_text = dataset_tgt[i][config_tgt][self.tgt]
                if len(src_text) <= 200:
                    samples.append(Sample(
                        input=src_text,
                        reference=tgt_text,
                        meta={"src": self.src, "tgt": self.tgt}
                    ))
        
        print(f"  Loaded {len(samples)} samples")
        return samples
    
    def compute_scores(self, samples: List[Sample], outputs: List[str]) -> List[Optional[float]]:
        """Compute per-sample COMET scores."""
        model = get_comet_model(self.comet_model)
        
        # Build data, tracking which indices have valid outputs
        data = []
        valid_indices = []
        for i, (s, o) in enumerate(zip(samples, outputs)):
            if o is not None:
                data.append({"src": s.input, "mt": o, "ref": s.reference})
                valid_indices.append(i)
        
        if not data:
            return [None] * len(samples)
        
        gpus = 1 if has_gpu() else 0
        result = model.predict(data, batch_size=32, gpus=gpus, progress_bar=True)
        
        # Map scores back to original indices
        scores = [None] * len(samples)
        for idx, score in zip(valid_indices, result.scores):
            scores[idx] = float(score)
        
        return scores
    
    def aggregate_scores(self, scores: List[Optional[float]]) -> dict:
        """Aggregate COMET scores."""
        valid = [s for s in scores if s is not None]
        if not valid:
            return {"comet": None, "n": 0}
        return {"comet": sum(valid) / len(valid), "n": len(valid)}
    
    def cache_key(self) -> str:
        """Return cache key for this translation task."""
        return f"translate:{self.src}->{self.tgt}"
    
    def params_json(self) -> str:
        """Return params as JSON."""
        return json.dumps({"src": self.src, "tgt": self.tgt}, sort_keys=True)
    
    def metric_name(self) -> str:
        """Return metric name for caching (e.g., 'comet_wmt22')."""
        return f"comet_{self.comet_model}"
    
    def format_progress(self, idx: int, total: int) -> str:
        """Format progress indicator: 'en->ru'."""
        return f"{self.src}->{self.tgt}"
