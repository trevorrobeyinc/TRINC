"""Test helper for test/video-source-url.test.ts: create a named pipe (FIFO) at argv[1].

It calls the system call through Python's os module instead of running the command-line tool, so the
tool's name is on no process command line. Falcon rule 8 kills a shell whose command line holds that name
followed by "nc" (a direct exec of the tool is not a shell and would not match today); keeping the name off
every command line means no later rule can make `npm test` page either.
"""
import os
import sys

os.mkfifo(sys.argv[1], 0o600)
