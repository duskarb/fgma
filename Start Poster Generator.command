#!/bin/zsh
cd "$(dirname "$0")"

PORT=3000

if ! command -v npm >/dev/null 2>&1; then
  echo "npm을 찾을 수 없습니다. Node.js가 설치되어 있는지 확인해주세요."
  echo
  read -k 1 "reply?아무 키나 누르면 닫습니다..."
  exit 1
fi

while lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

URL="http://localhost:${PORT}"

npm run build || {
  echo
  read -k 1 "reply?빌드에 실패했습니다. 아무 키나 누르면 닫습니다..."
  exit 1
}

npm run preview -- --host 0.0.0.0 --port "$PORT" --strictPort &
SERVER_PID=$!
trap "kill $SERVER_PID >/dev/null 2>&1" EXIT

sleep 1
open "$URL"
wait "$SERVER_PID"
