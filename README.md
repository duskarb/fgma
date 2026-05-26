# f(g)=ma

[Live Demo](https://fgma-sage.vercel.app/)

그래픽 디자인의 기본 문법은 배치다.  
디자이너는 요소를 고르고, 위치를 정하고, 크기를 조절한다.

**f(g)=ma는 그 문법을 조금 다른 방향으로 밀어본다.**

여기서 디자이너는 모든 결과를 직접 배치하지 않는다.  
대신 텍스트의 밀도, 굵기, 위치, 왜곡 방식, 운동 조건을 설계한다.  
포스터는 디자이너가 놓은 요소들의 합이 아니라,  
디자이너가 설정한 조건들이 서로 반응하며 만들어낸 결과가 된다.

동시에 f(g)=ma는 실제로 사용할 수 있는 포스터 제작 도구다.  
텍스트를 입력하고, 파라미터를 조절하고, 결과를 이미지나 영상으로 내보낼 수 있다.  
작품처럼 사고하지만, 도구처럼 손에 잡히는 것을 목표로 한다.

---

The basic grammar of graphic design is placement.  
The designer chooses elements, sets positions, and adjusts sizes.

**f(g)=ma pushes that grammar in a different direction.**

Here, the designer does not directly place every result.  
Instead, they design conditions: density, weight, position, distortion, and motion.  
The poster is not the sum of placed elements.  
It is the outcome of conditions reacting to each other.

At the same time, f(g)=ma is a practical poster-making tool.  
You can enter text, adjust parameters, and export the result as image or motion.  
It is meant to think like a work, while remaining usable as a tool.

## 미리보기 / Preview

### 움직이는 포스터 예시

<img src="assets/example-motion.gif" alt="움직이는 포스터 예시" width="50%">

### 기본 화면

<img src="assets/basic-screen.png" alt="기본 화면" width="70%">

### 효과 적용 화면

<img src="assets/effect-screen.png" alt="효과 적용 화면" width="70%">

## 무엇인가 / What It Is

f(g)=ma는 타이포그래피를 물리적 힘으로 다루는 생성형 포스터 도구다.

텍스트를 입력하고 파라미터를 조절하면, 시스템이 포스터를 생성한다.  
여기서 텍스트는 단순히 읽히는 문자가 아니다.  
질량을 갖고, 밀도를 만들고, 포스터 표면을 밀고 당기는 힘으로 작동한다.

---

f(g)=ma is a generative poster tool that treats typography as physical force.

Enter text, adjust parameters, and the system generates a poster.  
Here, text is not simply something to be read.  
It carries mass, creates density, and acts as a force that pushes and pulls the poster surface.

## 왜 다른가 / Why It Is Different

대부분의 그래픽 디자인 도구는 직접 배치 문법으로 작동한다.  
디자이너는 요소를 고르고, 캔버스 위에 놓고, 크기와 위치를 하나씩 결정한다.  
이 방식은 디자이너에게 큰 자유를 주지만,  
동시에 결과물의 모든 지점을 직접 통제하고 확인해야 한다는 뜻이기도 하다.

f(g)=ma는 그 구조에서 디자이너를 한 발 물러나게 한다.

텍스트의 밀도, 위치, 굵기가 서로 반응하며 레이아웃을 결정할 때,  
디자이너의 의도는 고정된 배치가 아니라 조건으로 존재한다.  
그 조건이 만드는 결과는 종종 의도를 초과하고,  
디자이너는 그 결과를 다시 조정하며 자신만의 시각 시스템을 만든다.

---

Most graphic design tools operate through direct placement.  
The designer selects an element, places it on a canvas, and decides each property one by one.  
This gives the designer a great amount of freedom.  
But it also means the designer must directly control and confirm every part of the result.

f(g)=ma steps back from that structure.

When text density, position, and weight interact to determine layout,  
the designer's intention does not appear as a fixed arrangement.  
It exists as a set of conditions.  
The results often exceed the original plan, and the designer adjusts them into a visual system of their own.

## 작동 원리 / How It Works

f(g)=ma는 텍스트 레이어를 캔버스에 그린 뒤,  
글자가 차지하는 픽셀의 알파값을 샘플링한다.  
밀도가 충분한 셀은 질량점으로 변환되고,  
이 질량점 배열이 WebGL 셰이더로 전달되어 포스터 표면을 왜곡한다.

자세한 변환 과정은 [작동 원리 문서](docs/algorithm.md)에서 확인할 수 있다.

---

f(g)=ma renders text layers onto a canvas,  
then samples the alpha values of pixels occupied by each character.  
Cells with sufficient density are converted into mass points.  
This array of mass points is passed to a WebGL shader,  
which distorts the poster surface accordingly.

See [algorithm documentation](docs/algorithm.md) for details.

## 기능 / Features

- 텍스트 레이어 추가 및 편집
- 한국어·영어 폰트 선택
- 글자 크기, 굵기, 색상, 회전, 위치 조절
- 배경색 및 아트보드 크기·방향 설정
- 텍스트 밀도 기반 질량점 및 격자 생성
- 왜곡 강도, 감쇠, 포인트 간격, 움직임 조절
- PNG, PDF, WEBM, MP4, GIF 내보내기

---

- Add and edit multiple text layers
- Select Korean and English fonts
- Control size, weight, color, rotation, and position
- Set background color and artboard size or orientation
- Generate density-based mass points and grid
- Adjust distortion intensity, damping, point spacing, and motion
- Export as PNG, PDF, WEBM, MP4, or GIF

## 시작하기 / Getting Started

### macOS

1. Node.js 18 이상을 [nodejs.org](https://nodejs.org)에서 설치한다.
2. 프로젝트 폴더에서 `Start fgma.command`를 더블클릭한다.
3. 처음 실행 시 필요한 패키지가 자동으로 설치된다.
4. 브라우저가 열리면 포스터 제너레이터를 사용할 수 있다.

macOS가 실행을 차단하면 파일을 우클릭 → **열기** → 경고창에서 **열기**를 선택한다.

---

1. Install Node.js 18 or higher from [nodejs.org](https://nodejs.org).
2. Double-click `Start fgma.command` in the project folder.
3. Required packages install automatically on first run.
4. When the browser opens, the poster generator is ready to use.

If macOS blocks the file, right-click → **Open** → click **Open** in the warning dialog.

### Windows

1. Node.js 18 이상을 [nodejs.org](https://nodejs.org)에서 설치한다.
2. 프로젝트 폴더에서 `Start fgma.bat`를 더블클릭한다.
3. 처음 실행 시 필요한 패키지가 자동으로 설치된다.
4. 실행 중 검은 명령 프롬프트 창을 닫지 않는다.

Windows SmartScreen이 실행을 막으면 **추가 정보**를 누른 뒤 **실행**을 선택한다.

---

1. Install Node.js 18 or higher from [nodejs.org](https://nodejs.org).
2. Double-click `Start fgma.bat` in the project folder.
3. Required packages install automatically on first run.
4. Do not close the command prompt window while the app is running.

If Windows SmartScreen blocks the file, click **More info**, then choose **Run anyway**.

### 터미널 / Terminal

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`을 연다.  
Open `http://localhost:5173` in a browser.

## 스택 / Built With

React · TypeScript · Vite · WebGL · HTML Canvas  
jsPDF · gifenc · mp4-muxer

## 브라우저 호환성 / Browser Compatibility

PNG, PDF 내보내기는 최신 브라우저 대부분에서 작동한다.  
WEBM, MP4, GIF 내보내기는 브라우저의 영상 인코딩 지원에 따라 다를 수 있다.  
Chrome 또는 Edge 최신 버전을 권장한다.

---

PNG and PDF export work in most modern browsers.  
WEBM, MP4, and GIF export depend on browser video encoding support.  
Chrome or Edge, latest version, is recommended.

## 입장 / Position

f(g)=ma는 디자이너의 판단을 대신하는 도구가 아니다.  
그 판단이 일어나는 위치를 바꾸는 도구다.

결과를 직접 결정하는 대신,  
결과가 만들어지는 힘과 규칙과 조건을 설계한다.

f(g)=ma는 디자이너의 역할이 배치에서 시스템 설계로 이동할 때  
무엇이 가능해지는지를 탐구한다.

---

f(g)=ma is not a tool for replacing the designer's judgment.  
It is a tool for changing where that judgment happens.

Instead of deciding every visual result directly,  
the designer defines the forces, rules, and conditions from which results emerge.

f(g)=ma explores what becomes possible  
when the role of the designer moves from arrangement to system design.

## 라이선스 / License

MIT License. See [LICENSE](LICENSE) for details.
