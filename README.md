# f(g)=ma — Poster Generator

**f(g)=ma** is a generative graphic authoring tool that creates posters from the relationship between typography, density, and gravity-like rules.
It is not only a tool for making a finished poster, but a system for designing how posters are generated and transformed.

사용자는 레이아웃, 텍스트 크기, 두께, 컬러 같은 기본적인 시각 요소를 선택하고, 시스템은 텍스트의 밀도와 중력 규칙을 바탕으로 포스터를 변형하고 생성합니다.
디자이너는 모든 요소를 직접 배치하는 대신, 결과가 발생하는 조건과 변수들을 조정하며 다양한 출력값을 탐색합니다.

이 프로젝트는 완성된 포스터 하나를 디자인하는 것보다, **포스터가 생성되고 변형되는 규칙과 상호작용 방식을 설계하는 생성형 저작 시스템**에 초점을 둡니다.

## Concept

Most poster-making tools are based on direct placement: text boxes are moved, resized, aligned, and adjusted by hand.
**f(g)=ma** approaches poster design differently. Text is not only placed on a surface; it becomes a graphic input that can form density, create mass points, and distort the poster field.

The title is a variation of the physical formula `F = ma`.
Here, `g` can be read as **graphic**, **grid**, **gravity**, or **generator**. The poster becomes a field where typography behaves like mass and layout becomes force.

This project does not remove the designer's control.
Instead, it shifts control from direct arrangement to rule-making, parameter selection, and exploration.
The final result is produced through the interaction between the user's visual decisions and the system's computational rules.

## What It Does

- Creates typography-based poster compositions from user-defined text layers.
- Lets the user control layout, text size, weight, color, and background.
- Generates density-based mass points from text.
- Distorts the poster surface through gravity-like parameters.
- Supports static and animated poster output.
- Works as a tool for exploring a range of visual possibilities rather than producing one predetermined image.

## Main Controls

### Visual Controls

- Add and edit multiple text layers.
- Choose Korean and English typefaces.
- Adjust text size, weight, color, rotation, and placement.
- Set background color.
- Select artboard size and orientation.

### System Controls

- Show or hide the visual grid.
- Show or hide mass points.
- Adjust distortion strength.
- Adjust decay.
- Adjust point spacing and size.
- Explore how different text densities change the final poster.

## Basic Workflow

1. Open the poster generator in the browser.
2. Set the artboard size and background color.
3. Add text layers.
4. Adjust layout, text size, weight, color, and placement.
5. Turn on grid or mass point visualization if needed.
6. Adjust system parameters such as strength, decay, point spacing, and motion amount.
7. Generate variations by changing text density and visual settings.
8. Export the final result.

## Getting Started

### Requirements

- Node.js v18 or higher
- npm, which is included with Node.js

### Method 1: Launch with the Included Command File

For macOS users, the project includes one double-click command file.

1. Install Node.js 18 or higher from <https://nodejs.org/> if it is not installed yet.
2. Double-click `Start Poster Generator.command` in the project folder.
3. On the first launch, the script installs the required packages automatically.
4. The app opens in your default browser.

If a permission error appears, run the following command in Terminal:

```bash
chmod +x "Start Poster Generator.command"
```

Then double-click the command file again.

### Method 2: Run Manually from the Terminal

Open the project folder in Terminal and install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local URL shown in the terminal, usually:

```bash
http://localhost:5173
```

## Export

The project supports poster export depending on the current build configuration:

- PDF for print-oriented static output.
- MP4 or GIF for animated poster output.

## Built With

- React
- Vite
- WebGL
- TypeScript
- HTML Canvas / browser-based rendering

## Project Direction

**f(g)=ma** is not a tool that replaces the designer with an automatic poster generator.
It is a tool that moves the designer's control from placing every element by hand to designing rules, variables, and conditions.

In that sense, the project treats typography not only as language, but as force.
