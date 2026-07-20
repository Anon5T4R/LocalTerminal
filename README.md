# LocalTerminal

Terminal **100% offline** da suíte Local — o motor de PTY do LocalCode
(portable-pty + xterm.js), agora como app standalone.

## Recursos

**v0.5**
- **Quake mode**: um atalho global faz um terminal descer do topo da tela,
  sempre por cima, e o mesmo atalho o esconde (Esc também). Altura, largura,
  perfil e a combinação são configuráveis. Vem **desligado** por padrão — ligar
  sozinho tomaria uma tecla global de todo mundo. Se o sistema recusar a
  combinação (outro app já a tem), o app **avisa** em vez de ficar mudo.
- **Perfis**: conjuntos salvos de shell + diretório inicial + variáveis de
  ambiente + aparência (fonte, tamanho, cores do terminal), escolhíveis no
  menu ▾ ao abrir aba. Os valores das variáveis ficam só nesta máquina e
  **nunca aparecem em log**. Diretório que não existe mais não vira silêncio:
  o terminal abre na pasta do usuário e diz que caiu.
- **"Abrir aqui" a partir do LocalFiles** (v0.6.0+): o gerenciador de arquivos
  chama `LocalTerminal --cwd <pasta>`; se o app já estiver aberto, a pasta vira
  uma aba nova em vez de uma segunda janela.

**v0.2**
- **Dividir painel** (Ctrl+Shift+D): dois terminais lado a lado na mesma aba,
  cada um com seu shell; fechar um painel volta pra um só

**v0.1**
- **Abas** (Ctrl+Shift+T abre · Ctrl+Shift+W fecha · Ctrl+Tab alterna · botão
  do meio fecha) — fechar a última aba fecha o app
- **Perfis de shell detectados na máquina**: PowerShell 7 · Windows
  PowerShell · cmd · Git Bash · **WSL (uma entrada por distro)** no Windows;
  `$SHELL` + bash/zsh/fish no Linux — menu ▾ escolhe, padrão configurável
- **Busca no terminal** (Ctrl+Shift+F, Enter/Shift+Enter navega)
- **Copiar/colar** (Ctrl+Shift+C/V) + opção **copiar ao selecionar**
- **Links clicáveis** (abrem no navegador padrão)
- **Zoom da fonte** (Ctrl+= / Ctrl+-, persiste) · scrollback 10 mil linhas
- Tema claro/escuro/sistema (o xterm acompanha) · UI em **PT/EN/ES**

## Stack

Tauri 2 + React 19 + Vite + TypeScript no front (`@xterm/xterm` + addons
fit/search/web-links); Rust no back (`portable-pty` — ConPTY no Windows,
openpty no Linux). Sem sidecar, sem rede.

## Dev

```bash
npm install
npm run tauri dev   # porta 1462
```

## Release

Tag `vX.Y.Z` → GitHub Actions builda NSIS (Windows) + AppImage (Linux) e
publica a Release. Parte da suíte [Local](https://github.com/Anon5T4R).

## Licença

MIT
