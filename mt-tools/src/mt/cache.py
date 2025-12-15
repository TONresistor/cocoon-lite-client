"""Generic cache for task results using DuckDB.

Supports caching for any task (translate, summarize, etc.) with flexible key structure.
Thread-safe with connection pooling.
"""

import hashlib
import json
import threading
import time
from typing import Optional, Tuple, Any
import duckdb


def stable_hash(s: str) -> str:
    """Deterministic hash (32 hex chars from sha256)."""
    return hashlib.sha256(s.encode('utf-8')).hexdigest()[:32]


def compute_sample_hash(src: str, hyp: str, ref: str) -> str:
    """Compute hash for a single (source, hypothesis, reference) triple."""
    data_str = json.dumps({
        "s": src[:200], 
        "h": (hyp or "")[:200], 
        "r": (ref or "")[:200]
    }, sort_keys=True, ensure_ascii=False)
    return stable_hash(data_str)


class TaskCache:
    """Generic cache for task outputs using DuckDB.
    
    Schema:
        - task: task name (translate, summarize, etc.)
        - input_hash: hash of input text
        - config_key: model/endpoint identifier
        - params_json: task-specific params as JSON (e.g., target_lang, lang)
        - output: the cached result
        - duration: execution time
        - timestamp: when cached
    
    Thread-safe with thread-local connections.
    """
    
    def __init__(self, cache_path: str = "task_cache.duckdb", rewrite: bool = False):
        """Initialize cache.
        
        Args:
            cache_path: Path to DuckDB file (None to disable)
            rewrite: If True, ignore cached values but still write new ones
        """
        self.cache_path = cache_path
        self.enabled = cache_path is not None
        self.rewrite = rewrite
        self._local = threading.local()
        self._lock = threading.Lock()
        if self.enabled:
            self._init_db()
    
    def _get_conn(self):
        """Get thread-local connection."""
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            self._local.conn = duckdb.connect(self.cache_path)
        return self._local.conn
    
    def _init_db(self):
        """Initialize DuckDB table."""
        try:
            conn = self._get_conn()
            conn.execute("""
                CREATE TABLE IF NOT EXISTS cache (
                    task VARCHAR,
                    input_hash VARCHAR,
                    config_key VARCHAR,
                    params_json VARCHAR,
                    output VARCHAR,
                    duration DOUBLE,
                    timestamp DOUBLE,
                    PRIMARY KEY (task, input_hash, config_key, params_json)
                )
            """)
            count = conn.execute("SELECT COUNT(*) FROM cache").fetchone()[0]
            if count > 0:
                tasks = conn.execute("SELECT DISTINCT task FROM cache").fetchall()
                tasks_str = ', '.join(t[0] for t in tasks)
                print(f"Cache: {count} entries ({tasks_str})")
        except Exception as e:
            print(f"Warning: Could not initialize cache: {e}")
            self.enabled = False
    
    def get(self, task: str, input_text: str, config_key: str, params: dict = None) -> Optional[Tuple[str, float]]:
        """Get cached result.
        
        Args:
            task: Task name (translate, summarize)
            input_text: Input text
            config_key: Config identifier (e.g., "azure:gpt-4.1-mini")
            params: Task-specific params (e.g., {"target_lang": "ru"})
        
        Returns:
            (output, duration) or None if not cached
        """
        if not self.enabled or self.rewrite:
            return None
        
        input_hash = stable_hash(input_text)
        params_json = json.dumps(params or {}, sort_keys=True)
        
        try:
            conn = self._get_conn()
            result = conn.execute("""
                SELECT output, duration FROM cache 
                WHERE task = ? AND input_hash = ? AND config_key = ? AND params_json = ?
            """, [task, input_hash, config_key, params_json]).fetchone()
            
            if result:
                return (result[0], result[1])
        except Exception as e:
            pass
        return None
    
    def put(self, task: str, input_text: str, config_key: str, output: str, duration: float, params: dict = None):
        """Store result in cache.
        
        Args:
            task: Task name
            input_text: Input text
            config_key: Config identifier
            output: The result to cache
            duration: Execution time
            params: Task-specific params
        """
        if not self.enabled:
            return
        
        input_hash = stable_hash(input_text)
        params_json = json.dumps(params or {}, sort_keys=True)
        
        try:
            with self._lock:
                conn = self._get_conn()
                conn.execute("""
                    INSERT OR REPLACE INTO cache 
                    (task, input_hash, config_key, params_json, output, duration, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, [task, input_hash, config_key, params_json, output, duration, time.time()])
        except Exception as e:
            print(f"Warning: Could not cache result: {e}")
    
    def stats(self, task: str = None) -> dict:
        """Return cache statistics."""
        if not self.enabled:
            return {"enabled": False}
        try:
            conn = self._get_conn()
            if task:
                count = conn.execute("SELECT COUNT(*) FROM cache WHERE task = ?", [task]).fetchone()[0]
                configs = conn.execute(
                    "SELECT DISTINCT config_key FROM cache WHERE task = ?", [task]
                ).fetchall()
            else:
                count = conn.execute("SELECT COUNT(*) FROM cache").fetchone()[0]
                configs = conn.execute("SELECT DISTINCT config_key FROM cache").fetchall()
            
            return {
                "enabled": True,
                "count": count,
                "configs": [c[0] for c in configs]
            }
        except:
            return {"enabled": True, "error": True}
    
    def clear(self, task: str = None):
        """Clear cache entries."""
        if not self.enabled:
            return
        try:
            conn = self._get_conn()
            if task:
                conn.execute("DELETE FROM cache WHERE task = ?", [task])
            else:
                conn.execute("DELETE FROM cache")
        except Exception as e:
            print(f"Warning: Could not clear cache: {e}")
    
    def save(self):
        """Explicitly checkpoint/save the cache."""
        if not self.enabled:
            return
        try:
            conn = self._get_conn()
            conn.execute("CHECKPOINT")
        except:
            pass
    



