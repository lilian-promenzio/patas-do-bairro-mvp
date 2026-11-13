#!/usr/bin/env bash
# Monitoramento de disponibilidade do MVP em produção.
# Verifica health check, página (PWA) e API; escreve um relatório em Markdown
# (no GitHub Actions vai para o resumo do job) e sai com código 1 se algo estiver DOWN.
set -u
export LC_ALL=C   # garante ponto decimal na formatação dos tempos

URL_APP="${URL_APP:-https://patas-do-bairro-mvp.onrender.com}"
RELATORIO="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
TENTATIVAS="${TENTATIVAS:-5}"   # o plano gratuito pode levar ~1 min para "acordar"
ESPERA="${ESPERA:-20}"
falhas=0

{
  echo "## Monitoramento — Instituto Patas do Bairro"
  echo
  echo "Alvo: $URL_APP · Verificado em $(TZ=America/Sao_Paulo date '+%d/%m/%Y %H:%M:%S') (Brasília)"
  echo
  echo "| Verificação | Status | HTTP | Tempo de resposta | Tentativas |"
  echo "| --- | --- | --- | --- | --- |"
} >> "$RELATORIO"

# checar <nome> <codigo_esperado> <texto_esperado_no_corpo> <args do curl...>
checar() {
  local nome="$1" esperado="$2" texto="$3"; shift 3
  local tentativa saida codigo tempo corpo
  for ((tentativa = 1; tentativa <= TENTATIVAS; tentativa++)); do
    corpo="$(mktemp)"
    saida="$(curl -s -o "$corpo" -w '%{http_code} %{time_total}' --max-time 90 "$@" || true)"
    codigo="${saida%% *}"; tempo="${saida##* }"
    if [[ "$codigo" == "$esperado" ]] && grep -q -- "$texto" "$corpo"; then
      printf '| %s | ✅ UP | %s | %.2f s | %d |\n' "$nome" "$codigo" "$tempo" "$tentativa" >> "$RELATORIO"
      rm -f "$corpo"; return 0
    fi
    rm -f "$corpo"
    (( tentativa < TENTATIVAS )) && sleep "$ESPERA"
  done
  printf '| %s | 🔴 DOWN | %s | %.2f s | %d |\n' "$nome" "${codigo:-000}" "${tempo:-0}" "$TENTATIVAS" >> "$RELATORIO"
  falhas=$((falhas + 1))
  return 1
}

checar "Health check (GET /api/health)" 200 '"status":"ok"' "$URL_APP/api/health"
checar "Página da PWA (GET /)" 200 'Patas do Bairro' "$URL_APP/"
checar "API de login (credencial inválida → 401)" 401 'CREDENCIAIS_INVALIDAS' \
  -X POST -H 'Content-Type: application/json' -d '{"email":"monitor@exemplo.org","senha":"x"}' "$URL_APP/api/login"

echo >> "$RELATORIO"
if (( falhas > 0 )); then
  echo "**Resultado: 🔴 DOWN** — $falhas verificação(ões) falharam." >> "$RELATORIO"
  exit 1
fi
echo "**Resultado: ✅ UP** — todas as verificações passaram." >> "$RELATORIO"
