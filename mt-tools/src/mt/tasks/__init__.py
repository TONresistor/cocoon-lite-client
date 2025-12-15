"""Task registry for mt CLI."""

from mt.tasks.base import Task, Sample, TaskResult
from mt.tasks.translate import TranslateTask
from mt.tasks.summarize import SummarizeTask

# Registry of task classes (not instances)
TASK_CLASSES = {
    "translate": TranslateTask,
    "summarize": SummarizeTask,
}


def get_task(name: str, **kwargs) -> Task:
    """Create task instance with given parameters.
    
    Examples:
        task = get_task("translate", src="en", tgt="ru")
        task = get_task("summarize", lang="en")
    """
    if name not in TASK_CLASSES:
        raise ValueError(f"Unknown task: {name}. Available: {list(TASK_CLASSES.keys())}")
    return TASK_CLASSES[name](**kwargs)


def list_tasks():
    """List all available task names."""
    return list(TASK_CLASSES.keys())


__all__ = ["Task", "Sample", "TaskResult", "get_task", "list_tasks", "TranslateTask", "SummarizeTask"]
