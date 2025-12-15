"""Run commands - single inference."""

import sys
import time

from mt import config_from_args
from mt.tasks import get_task


def get_input_text(args) -> str:
    """Get input text from args.input, args.file, or stdin."""
    if args.input:
        return args.input
    elif args.file:
        with open(args.file, 'r', encoding='utf-8') as f:
            return f.read().strip()
    else:
        if sys.stdin.isatty():
            print('Paste text (Ctrl+D when done):', file=sys.stderr)
        return sys.stdin.read().strip()


def cmd_run(args):
    """Run single inference for any task."""
    text = get_input_text(args)
    if not text:
        sys.exit("No text provided.")
    
    config = config_from_args(args)
    
    # Create task with appropriate params
    if args.task == "translate":
        if not args.to:
            sys.exit("--to is required for translate task")
        task = get_task("translate", src="en", tgt=args.to)
    elif args.task == "summarize":
        lang = args.lang or "en"
        task = get_task("summarize", lang=lang)
    else:
        sys.exit(f"Unknown task: {args.task}")
    
    if args.verbose:
        print(f"Running {task.name}...", file=sys.stderr)
        print(f"  Config: {task.cache_key()}", file=sys.stderr)
        print(f"  Endpoint: {config.endpoint}" + (" (Azure)" if config.use_azure else ""), file=sys.stderr)
    
    start = time.time()
    result = task.run(text, config)
    duration = time.time() - start
    
    if args.verbose:
        print(f"  Time: {duration:.3f}s", file=sys.stderr)
    
    print(result)
