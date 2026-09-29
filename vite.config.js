import { defineConfig } from 'vite';

// GitHub Pages 하위 경로(https://aiagentohms.github.io/todo_list_3th/)에 맞춘 base.
export default defineConfig({
  base: '/todo_list_3th/',
  server: { port: 5173 },
});
