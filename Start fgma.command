#!/bin/zsh
cd "$(dirname "$0")"

# Remove macOS quarantine flag from fgma.app so it can be double-clicked directly
xattr -dr com.apple.quarantine fgma.app 2>/dev/null

PORT=3000
BUILD_NEEDED=0

run_build() {
  npm run build || {
    echo
    echo "빌드에 실패해 패키지를 다시 확인합니다..."
    npm install && npm run build || {
      echo
      read -k 1 "reply?빌드에 실패했습니다. 아무 키나 누르면 닫습니다..."
      exit 1
    }
  }
}

start_server() {
  npm run preview -- --host 0.0.0.0 --port "$PORT" --strictPort &
  SERVER_PID=$!
}

if ! command -v npm >/dev/null 2>&1; then
  echo "npm을 찾을 수 없습니다. Node.js가 설치되어 있는지 확인해주세요."
  echo
  read -k 1 "reply?아무 키나 누르면 닫습니다..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "처음 실행을 위해 패키지를 설치합니다..."
  npm install || {
    echo
    read -k 1 "reply?패키지 설치에 실패했습니다. 아무 키나 누르면 닫습니다..."
    exit 1
  }
fi

while lsof -nP -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

URL="http://localhost:${PORT}"

if [ ! -f "dist/index.html" ]; then
  BUILD_NEEDED=1
elif find index.html package.json vite.config.ts tsconfig.json src assets -type f -newer "dist/index.html" | grep -q .; then
  BUILD_NEEDED=1
fi

if [ "$BUILD_NEEDED" -eq 1 ]; then
  run_build
else
  echo "변경된 파일이 없어 기존 빌드를 사용합니다."
fi

start_server
trap "kill $SERVER_PID >/dev/null 2>&1" EXIT

for _ in {1..30}; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    open "$URL"
    wait "$SERVER_PID"
    exit $?
  fi
  sleep 0.2
done

if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
  open "$URL"
  wait "$SERVER_PID"
else
  if [ "$BUILD_NEEDED" -eq 0 ]; then
    echo "기존 빌드 실행에 실패해 다시 빌드합니다..."
    run_build
    start_server
    sleep 1
    open "$URL"
    wait "$SERVER_PID"
  else
    echo
    read -k 1 "reply?실행에 실패했습니다. 아무 키나 누르면 닫습니다..."
    exit 1
  fi
fi
