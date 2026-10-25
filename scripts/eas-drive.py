#!/usr/bin/env python3
"""Runs an EAS CLI command in a pseudo-terminal and answers its yes/no prompts.

The first iOS build has to create a distribution certificate and provisioning profile, which EAS
only does in interactive mode. Apple authentication itself uses the App Store Connect API key from
the EXPO_ASC_* environment variables, so no Apple ID login is ever prompted.

Usage: eas-drive.py <eas args...>
"""
import os
import pty
import re
import select
import sys

ANSWERS = [
    (re.compile(r'log in to your Apple account', re.I), b'n\n'),
    (re.compile(r'Push Notifications', re.I), b'n\n'),
    (re.compile(r'Generate a new Apple Distribution Certificate', re.I), b'y\n'),
    (re.compile(r'Generate a new Apple Provisioning Profile', re.I), b'y\n'),
    (re.compile(r'Reuse this distribution certificate', re.I), b'y\n'),
    (re.compile(r'register.*bundle identifier', re.I), b'y\n'),
    (re.compile(r'Would you like to (create|set up|generate|enable|link|proceed|continue|automatically)', re.I), b'y\n'),
    (re.compile(r'\(Y/n\)'), b'y\n'),
    (re.compile(r'\(y/N\)'), b'n\n'),
]

def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)
    cmd = ['npx', 'eas-cli@latest', *args]
    pid, fd = pty.fork()
    if pid == 0:
        os.environ['CI'] = ''  # let prompts render
        os.execvp(cmd[0], cmd)
    buf = b''
    answered_at = -1
    while True:
        try:
            r, _, _ = select.select([fd], [], [], 600)
        except InterruptedError:
            continue
        if not r:
            print('\n[eas-drive] no output for 10 minutes, giving up', file=sys.stderr)
            break
        try:
            chunk = os.read(fd, 4096)
        except OSError:
            break
        if not chunk:
            break
        sys.stdout.buffer.write(chunk)
        sys.stdout.flush()
        buf = (buf + chunk)[-4000:]
        text = re.sub(rb'\x1b\[[0-9;?]*[A-Za-z]', b'', buf).decode('utf-8', 'replace')
        tail = text[-600:]
        if tail != answered_at and ('?' in tail):
            for rx, ans in ANSWERS:
                if rx.search(tail):
                    os.write(fd, ans)
                    answered_at = tail
                    buf = b''
                    break
    _, status = os.waitpid(pid, 0)
    code = os.WEXITSTATUS(status) if os.WIFEXITED(status) else 1
    sys.exit(code)

if __name__ == '__main__':
    main()
