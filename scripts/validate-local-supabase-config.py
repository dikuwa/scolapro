"""Preflight for disposable local-stack CI; never connects to a hosted project.

Run with SUPABASE_CLI_VERSION set to the workflow's pinned version. The CLI's
own startup remains the complete schema/health check; this gate catches the
removed mail section, malformed TOML and pin drift before pulling containers.
"""

import os
from pathlib import Path
import subprocess
import sys
import tomllib


def validate(config):
    if "inbucket" in config:
        raise ValueError("[inbucket] is obsolete; use [local_smtp]")
    mail = config.get("local_smtp", {})
    if mail.get("enabled") is not True:
        raise ValueError("[local_smtp] must enable disposable local mail capture")
    port = mail.get("port")
    if type(port) is not int or not 1 <= port <= 65535:
        raise ValueError("[local_smtp].port must be a valid web-interface port")


def main():
    config_path = Path(sys.argv[1] if len(sys.argv) > 1 else "supabase/config.toml")
    with config_path.open("rb") as source:
        validate(tomllib.load(source))
    expected = os.environ.get("SUPABASE_CLI_VERSION")
    if not expected:
        raise ValueError("SUPABASE_CLI_VERSION must specify the CI pin")
    installed = subprocess.run(["supabase", "--version"], check=True, capture_output=True, text=True).stdout.strip()
    if installed != expected:
        raise ValueError(f"Expected Supabase CLI {expected}, found {installed}")
    print(f"Local Supabase config preflight passed (CLI {installed}, local mail capture enabled)")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        sys.exit(f"Local Supabase config preflight failed: {error}")
