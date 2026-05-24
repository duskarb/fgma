# Poster Generator (포스터 제너레이터)

A dynamic, WebGL-based poster generator built with React and Vite. It allows you to create typography-focused, animated graphics and export them to PDF, MP4, or GIF.

React와 Vite로 만들어진 동적인 WebGL 기반 포스터 제너레이터입니다. 타이포그래피 중심의 애니메이션 그래픽을 만들고 PDF, MP4, GIF 포맷으로 내보낼 수 있습니다.

## 🚀 Features (주요 기능)

- **Text & Typography (텍스트 및 타이포그래피)**
  - Add multiple text layers. (여러 텍스트 레이어 추가 기능)
  - Support for various Korean and English fonts (Pretendard, Gmarket Sans, Inter, etc.). (다양한 한글/영문 폰트 지원)
  - Drag, rotate, and align text. (텍스트 드래그, 회전, 정렬)
- **Dynamic WebGL Background (동적 WebGL 배경)**
  - Tweak physics parameters like strength, decay, epsilon, and motion amount. (강도, 감쇠, 입자 간격, 모션 양 등 물리 파라미터 조절)
  - Adjust point spacing and size for different visual effects. (포인트 간격 및 크기 조절로 다양한 시각 효과 연출)
- **Artboard Management (아트보드 관리)**
  - Preset sizes: A4, A3, 4:5, 1:1, 1920x1080(HD). (다양한 프리셋 크기 지원)
  - Orientation toggle (Portrait / Landscape). (가로/세로 방향 전환)
- **Exporting (내보내기)**
  - **PDF**: High-quality static poster export. (고해상도 정적 포스터 내보내기)
  - **MP4 / GIF**: Animated poster export (powered by `mp4-muxer` and `gifenc`). (애니메이션 포스터 내보내기)

## 🛠️ How to Use (사용 방법)

### Method 1: Using the Launcher (추천: 런처 사용하기)
For macOS users, a handy command script is included to automatically build and launch the generator.
macOS 사용자를 위해 자동으로 빌드하고 실행해주는 스크립트가 포함되어 있습니다.

1. Double click the `Start Poster Generator.command` file in the project folder.
   (프로젝트 폴더 내의 `Start Poster Generator.command` 파일을 더블 클릭합니다.)
2. A terminal window will open, check for Node.js, and launch the app in your default browser.
   (터미널 창이 열리면서 Node.js를 확인한 후 기본 브라우저에서 앱이 실행됩니다.)

*(Note: If you get a permission error, you may need to run `chmod +x "Start Poster Generator.command"` in your terminal first.)*
*(참고: 권한 오류가 발생할 경우 터미널에서 `chmod +x "Start Poster Generator.command"` 명령어를 먼저 실행해야 할 수 있습니다.)*

### Method 2: Manual Setup via CLI (수동 실행)
If you prefer using the terminal directly:
터미널을 직접 사용하는 것을 선호하신다면:

1. Open your terminal and navigate to the project directory. (터미널을 열고 프로젝트 디렉토리로 이동합니다.)
2. Install dependencies (패키지 설치):
   ```bash
   npm install
   ```
3. Start the development server (개발 서버 실행):
   ```bash
   npm run dev
   ```
4. Open the displayed `http://localhost:5173` link in your browser. (브라우저에서 `http://localhost:5173` 접속)

## 📋 Requirements (요구 사항)
- **Node.js** (v18 or higher recommended / v18 이상 권장)
- **npm** (comes with Node.js / Node.js와 함께 설치됨)
