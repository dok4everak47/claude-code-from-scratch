{
  description = "Claude Code from Scratch — Nix devShell (macOS Apple Silicon)";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = false;
        };

        # ── Node.js (current LTS) ────────────────────────────────────
        nodejs = pkgs.nodejs_22;

        # ── Human-readable system label ──────────────────────────────
        sysLabel = {
          aarch64-darwin = "macOS (ARM)";
          x86_64-darwin  = "macOS (Intel)";
          x86_64-linux   = "Linux (x64)";
          aarch64-linux  = "Linux (ARM)";
        }.${system} or system;

      in
      {
        devShells = {

          # ── 默认：全栈开发（CLI + Demo）─────────────────────────────
          default = pkgs.mkShell {
            buildInputs = with pkgs; [
              nodejs
              taskwarrior3
              git curl wget jq ripgrep
            ];

            SYSTEM_LABEL = sysLabel;

            # ── Proxy (ClashX GFW) ─────────────────────────────────────
            http_proxy  = "http://127.0.0.1:7890";
            https_proxy = "http://127.0.0.1:7890";
            HTTP_PROXY  = "http://127.0.0.1:7890";
            HTTPS_PROXY = "http://127.0.0.1:7890";
            all_proxy   = "socks5://127.0.0.1:7890";
            ALL_PROXY   = "socks5://127.0.0.1:7890";
            no_proxy    = "localhost,127.0.0.1,::1";
            NO_PROXY    = "localhost,127.0.0.1,::1";

            shellHook = ''
              echo "[nix] Proxy: http://127.0.0.1:7890 (ClashX)"

              # ── 检测 npm 依赖是否安装 ──────────────────────────────────
              if [ ! -d node_modules ]; then
                echo ""
                echo "  ╔══════════════════════════════════════════════════╗"
                echo "  ║  Missing node_modules — run  npm install         ║"
                echo "  ╚══════════════════════════════════════════════════╝"
                echo ""
              fi

              if [ -d demo ] && [ ! -d demo/node_modules ]; then
                echo ""
                echo "  ╔══════════════════════════════════════════════════╗"
                echo "  ║  Demo missing node_modules —                    ║"
                echo "  ║  cd demo && npm install                         ║"
                echo "  ╚══════════════════════════════════════════════════╝"
                echo ""
              fi

              echo ""
              echo "  🧊  Claude Code from Scratch devShell ($SYSTEM_LABEL)"
              echo "  ─────────────────────────────────────"
              echo "  Node   $(node --version)"
              echo "  npm    $(npm --version)"
              echo "  tsc    $(tsc --version 2>/dev/null || echo '(not in PATH — use npx tsc)')"
              echo "  task   $(task --version 2>/dev/null || echo '(not in PATH)')"
              echo ""
              echo "  Available shells: nix develop .#default (CLI + Demo)"
              echo ""
            '';
          };

          # ── cli：只做 CLI 开发（无需 Demo 依赖）─────────────────────
          cli = pkgs.mkShell {
            buildInputs = with pkgs; [
              nodejs taskwarrior3 git jq ripgrep
            ];

            shellHook = ''
              echo ""
              echo "  ⚙️  CLI devShell"
              echo "  ───────────────"
              echo "  Node   $(node --version)"
              echo "  npm    $(npm --version)"
              echo "  tsc    $(tsc --version 2>/dev/null || echo '(not in PATH — use npx tsc)')"
              echo "  task   $(task --version 2>/dev/null || echo '(not in PATH)')"
              echo ""
            '';
          };

          # ── demo：只做 Demo 前端开发（React + Vite）─────────────────
          demo = pkgs.mkShell {
            buildInputs = with pkgs; [
              nodejs
            ];

            shellHook = ''
              echo ""
              echo "  🎨  Demo (React + Vite) devShell"
              echo "  ──────────────────────────────"
              echo "  Node   $(node --version)"
              echo "  npm    $(npm --version)"
              echo ""
              echo "  cd demo && npm run dev   (start dev server)"
              echo "  cd demo && npm run build (production build)"
              echo ""
            '';
          };

        }; # devShells

        formatter = pkgs.nixpkgs-fmt;
      }
    );
}
