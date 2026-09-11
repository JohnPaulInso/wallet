@echo off
rem (2026-07-13) Restore tracked files to latest commit; prev: none
git restore --staged .
git restore .
echo Restored tracked files to latest commit.
