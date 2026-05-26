# f(g)=ma

**A graphic instrument between tool and artwork.**  
**텍스트를 질량으로, 포스터를 힘의 장으로 바꾸는 그래픽 도구**

[Live Demo](https://fgma-sage.vercel.app/)

f(g)=ma는 도구와 작품의 사이에 있는 그래픽 시스템이다.

사용자는 포스터를 만들지만, 이 시스템이 보여주는 것은 단순한 결과물이 아니다.  
텍스트는 읽히는 문자가 아니라 질량이 되고, 레이아웃은 정적인 배치가 아니라 힘의 장이 된다.  
f(g)=ma는 디자이너가 결과를 직접 고정하는 대신, 결과가 발생하는 조건을 조율하도록 만든다.

---

f(g)=ma is a graphic instrument between tool and artwork.

The user makes posters, but the system reveals more than a finished image.  
Text becomes mass, and layout becomes a field of force.  
Instead of directly fixing a result, the designer tunes the conditions from which results emerge.

## 디자인 문법에 대한 주장 / A Claim About Graphic Grammar

그래픽 디자인의 기본 문법은 오랫동안 배치였다.  
디자이너는 요소를 고르고, 위치를 정하고, 크기를 조절한다.

f(g)=ma는 그 문법을 다른 방향으로 밀어본다.

여기서 디자이너의 판단은 결과를 직접 결정하는 방식으로만 나타나지 않는다.  
그 판단은 힘과 규칙과 조건을 설계하는 방식으로 이동한다.  
결과는 고정된 구성물이 아니라, 조정 가능한 시각 시스템으로 나타난다.

---

The basic grammar of graphic design has long been placement.  
The designer chooses elements, sets positions, and adjusts sizes.

f(g)=ma pushes that grammar in a different direction.

Here, the designer's judgment does not only appear as a directly fixed result.  
It moves into the design of forces, rules, and conditions.  
The outcome becomes not a fixed composition, but an adjustable visual system.

## 이 도구가 바꾸는 것 / What It Changes

대부분의 그래픽 디자인 도구는 직접 배치 문법으로 작동한다.  
디자이너는 캔버스 위에 요소를 놓고, 결과물의 모든 지점을 하나씩 통제한다.

f(g)=ma는 디자이너를 그 구조에서 한 발 물러나게 한다.

텍스트의 밀도, 위치, 굵기가 서로 반응하며 레이아웃을 결정할 때,  
디자이너의 의도는 고정된 배치가 아니라 조건으로 존재한다.  
그 조건이 만드는 결과는 종종 의도를 초과하고,  
디자이너는 그 결과를 다시 조정하며 자신만의 시각 시스템을 만든다.

---

Most graphic design tools operate through direct placement.  
The designer places elements on a canvas and controls each part of the result one by one.

f(g)=ma steps back from that structure.

When text density, position, and weight interact to determine layout,  
the designer's intention does not appear as a fixed arrangement.  
It exists as a set of conditions.  
The results often exceed the original plan, and the designer adjusts them into a visual system of their own.

## 생성 원리 / Generative Principle

f(g)=ma는 타이포그래피를 물리적 힘으로 다룬다.

텍스트 레이어를 캔버스에 그린 뒤, 글자가 차지하는 픽셀의 알파값을 샘플링한다.  
밀도가 충분한 셀은 질량점으로 변환되고,  
이 질량점 배열이 WebGL 셰이더로 전달되어 포스터 표면을 왜곡한다.

자세한 변환 과정은 [작동 원리 문서](docs/algorithm.md)에서 확인할 수 있다.

---

f(g)=ma treats typography as physical force.

It renders text layers onto a canvas, then samples the alpha values of pixels occupied by each character.  
Cells with enough density become mass points.  
Those mass points are passed to a WebGL shader, which distorts the poster surface accordingly.

See [algorithm documentation](docs/algorithm.md) for details.

## 결과 예시 / Results

### 움직이는 포스터 예시 / Motion Poster

<img src="assets/example-motion.gif" alt="움직이는 포스터 예시" width="50%">

### 기본 화면 / Basic Screen

<img src="assets/basic-screen.png" alt="기본 화면" width="70%">

### 효과 적용 화면 / Effect Screen

<img src="assets/effect-screen.png" alt="효과 적용 화면" width="70%">

## 사용법 / Usage

f(g)=ma는 실제로 사용할 수 있는 포스터 제작 도구이기도 하다.  
텍스트를 입력하고, 파라미터를 조절하고, 결과를 이미지나 영상으로 내보낼 수 있다.  
작품처럼 사고하지만, 도구처럼 손에 잡히는 것을 목표로 한다.

---

f(g)=ma is also a practical poster-making tool.  
You can enter text, adjust parameters, and export the result as image or motion.  
It is meant to think like a work, while remaining usable as a tool.

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

### Terminal

```bash
npm install
npm run dev
```

터미널에 표시되는 로컬 주소를 브라우저에서 연다. 보통 `http://localhost:3000`으로 실행된다.  
Open the local address shown in the terminal. It usually runs at `http://localhost:3000`.

### 도구로서 가능한 일 / As a Tool

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

## 개발 정보 / Development

### Built With

React · TypeScript · Vite · WebGL · HTML Canvas  
jsPDF · gifenc · mp4-muxer

### Browser Compatibility

PNG, PDF 내보내기는 최신 브라우저 대부분에서 작동한다.  
WEBM, MP4, GIF 내보내기는 브라우저의 영상 인코딩 지원에 따라 다를 수 있다.  
Chrome 또는 Edge 최신 버전을 권장한다.

---

PNG and PDF export work in most modern browsers.  
WEBM, MP4, and GIF export depend on browser video encoding support.  
Chrome or Edge, latest version, is recommended.

## License

MIT License. See [LICENSE](LICENSE) for details.
