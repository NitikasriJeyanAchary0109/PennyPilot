"""
Failed-attempt limiter used to slow down password guessing on login.

State is in-process memory: it needs no extra infrastructure and is enough for
a single API container. With several workers each keeps its own counters, so
the effective limit is per worker; move this to Redis if the API is scaled out.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Callable, Deque, Dict


class AttemptLimiter:
    def __init__(
        self,
        max_failures: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._clock = clock
        self._failures: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str) -> Deque[float]:
        hits = self._failures[key]
        cutoff = self._clock() - self.window_seconds
        while hits and hits[0] <= cutoff:
            hits.popleft()
        if not hits:
            self._failures.pop(key, None)
        return hits

    def retry_after(self, key: str) -> int:
        """Seconds until `key` may try again; 0 when it isn't blocked."""
        with self._lock:
            hits = self._prune(key)
            if len(hits) < self.max_failures:
                return 0
            return max(int(hits[0] + self.window_seconds - self._clock()) + 1, 1)

    def record_failure(self, key: str) -> None:
        with self._lock:
            self._failures[key].append(self._clock())

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._failures.clear()


# 5 wrong passwords per (client address, email) in 15 minutes → 429.
login_limiter = AttemptLimiter(max_failures=5, window_seconds=15 * 60)
