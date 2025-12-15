"""Base task interface.

Tasks are configured at creation and provide uniform methods.
Caller doesn't need to know task-specific params after construction.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional, Any, Dict, TYPE_CHECKING

if TYPE_CHECKING:
    from mt.cache import TaskCache
    from mt import TimingInfo


@dataclass
class Sample:
    """Universal sample for evaluation."""
    input: str
    reference: str
    meta: dict = None  # Task-specific metadata
    
    def __post_init__(self):
        if self.meta is None:
            self.meta = {}


@dataclass
class TaskResult:
    """Result from task.run() with optional metadata."""
    output: str
    timing: Optional["TimingInfo"] = None  # HTTP timing headers (if available)
    duration: float = 0.0  # Wall-clock duration
    meta: Dict[str, Any] = field(default_factory=dict)  # Task-specific metadata


class Task(ABC):
    """Base class for all tasks.
    
    Tasks are configured at creation:
        task = get_task("translate", src="en", tgt="ru")
        task = get_task("summarize", lang="en")
    
    Then used uniformly:
        output = task.run(text, config)
        samples = task.load_eval_data(n=100)
        scores = task.compute_scores(samples, outputs)
        # Or with caching:
        scores = task.compute_scores_cached(samples, outputs, cache, "comet")
    """
    
    name: str
    
    @abstractmethod
    def run(self, text: str, config: Any) -> TaskResult:
        """Run task on single input. Returns TaskResult with output and optional timing."""
        pass
    
    @abstractmethod
    def load_eval_data(self, n: int = 100) -> List[Sample]:
        """Load evaluation dataset."""
        pass
    
    @abstractmethod
    def compute_scores(self, samples: List[Sample], outputs: List[str]) -> List[Optional[float]]:
        """Compute per-sample scores. Returns list of floats (one per sample).
        
        This is the raw computation - no caching. Override in subclass.
        """
        pass
    
    def compute_scores_cached(
        self, 
        samples: List[Sample], 
        outputs: List[str], 
        cache: "TaskCache",
        metric_name: str = "score"
    ) -> List[Optional[float]]:
        """Compute scores with per-sample caching.
        
        1. Check cache for each sample
        2. Batch compute uncached samples
        3. Store new scores in cache
        4. Return combined results
        
        Args:
            samples: Evaluation samples
            outputs: Model outputs (parallel to samples)
            cache: TaskCache instance
            metric_name: Name for cache key (e.g., "comet", "bertscore")
        """
        from mt.cache import compute_sample_hash
        
        n = len(samples)
        scores = [None] * n
        uncached_indices = []
        uncached_samples = []
        uncached_outputs = []
        
        task_key = f"{self.name}_{metric_name}"
        
        # Check cache for each sample
        for i, (sample, output) in enumerate(zip(samples, outputs)):
            if output is None:
                continue
            
            sample_hash = compute_sample_hash(sample.input, output, sample.reference)
            cached = cache.get(task_key, sample_hash, metric_name, {})
            
            if cached:
                scores[i] = float(cached[0])  # cached[0] is the output string
            else:
                uncached_indices.append(i)
                uncached_samples.append(sample)
                uncached_outputs.append(output)
        
        # Batch compute uncached scores
        if uncached_samples:
            print(f"  Computing {len(uncached_samples)} uncached {metric_name} scores...")
            new_scores = self.compute_scores(uncached_samples, uncached_outputs)
            
            # Store in cache and results
            for idx, sample, output, score in zip(
                uncached_indices, uncached_samples, uncached_outputs, new_scores
            ):
                if score is not None:
                    sample_hash = compute_sample_hash(sample.input, output, sample.reference)
                    cache.put(task_key, sample_hash, metric_name, str(score), 0.0, {})
                scores[idx] = score
        
        cached_count = n - len(uncached_indices) - sum(1 for o in outputs if o is None)
        if cached_count > 0:
            print(f"  Used {cached_count} cached {metric_name} scores")
        
        return scores
    
    def aggregate_scores(self, scores: List[Optional[float]]) -> dict:
        """Aggregate per-sample scores into final metrics.
        
        Default: mean score. Override for custom aggregation.
        """
        valid = [s for s in scores if s is not None]
        if not valid:
            return {"score": None, "n": 0}
        return {"score": sum(valid) / len(valid), "n": len(valid)}
    
    @abstractmethod
    def cache_key(self) -> str:
        """Return stable cache key for this task configuration."""
        pass
    
    def params_json(self) -> str:
        """Return params as JSON for cache storage."""
        # Default implementation - subclasses can override
        return "{}"
    
    def metric_name(self) -> str:
        """Return metric name for caching (e.g., 'comet_wmt22', 'bertscore').
        
        Used by compute_scores_cached to build cache keys.
        """
        return "score"
    
    def format_progress(self, idx: int, total: int) -> str:
        """Format progress indicator for this task.
        
        Returns something like 'en->ru' for translate or 'en' for summarize.
        """
        return ""
