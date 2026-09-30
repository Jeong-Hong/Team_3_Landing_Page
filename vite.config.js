import { defineConfig } from 'vite';

// GitHub Pages 하위 경로(https://jeong-hong.github.io/Team_3_Landing_Page/)에 맞춘 base.
// 저장소 이름이 바뀌면 이 값도 '/<저장소 이름>/'으로 바꾼다.
export default defineConfig({
  base: '/Team_3_Landing_Page/',
  server: { port: 5173 },
});
