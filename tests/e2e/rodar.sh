#!/usr/bin/env bash
# QA (S10): sobe o Vite na porta 5199, roda os scripts e2e (todos ou os passados por argumento) e encerra o Vite.
cd "$(dirname "$0")/../.." || exit 1
npx vite --port 5199 --strictPort > tests/e2e/saida/vite.log 2>&1 &
VITE=$!
trap 'kill $VITE 2>/dev/null; pkill -f "vite --port 5199" 2>/dev/null' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:5199/ && break; sleep 0.5; done
STATUS=0
SCRIPTS=("$@")
[ ${#SCRIPTS[@]} -eq 0 ] && SCRIPTS=(tests/e2e/0*.cjs)
for s in "${SCRIPTS[@]}"; do
  echo "########## $s"
  node "$s" || STATUS=1
done
exit $STATUS
