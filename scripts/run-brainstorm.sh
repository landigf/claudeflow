#!/usr/bin/env bash
# Run the 4-persona brainstorm for MedTransfer second product.
# Calls OpenAI + Gemini directly (the YAML spec is documentation only).
# Usage: ./run-brainstorm.sh [output-file.md]
set -euo pipefail

OUT="${1:-/Users/landigf/Desktop/Code/Research/MedTransfer/research/brainstorm-4personas-2026-04-15.md}"
OPENAI_KEY="${OPENAI_API_KEY:-}"
GEMINI_KEY="${GOOGLE_API_KEY:-}"

if [ -z "$OPENAI_KEY" ] || [ -z "$GEMINI_KEY" ]; then
  echo "Missing OPENAI_API_KEY or GOOGLE_API_KEY" >&2
  exit 1
fi

# System prompt used by all 4 personas — keeps them constrained to useful output.
SYSTEM_PROMPT='Sei un advisor product strategy per una startup SaaS medica italiana. Genera idee di prodotto concrete (no buzzword, no vibe). Rispondi sempre in Italian markdown. Output schema richiesto: per ogni idea, sezione "### N. Titolo" con sottosezioni: **Problem**, **User value**, **MVP scope (settimane)**, **Pricing**, **Go-to-market**, **Kill risk**. Produci esattamente 5 idee. Rigorosamente: idee DEL TUTTO SPECIFICHE a MedTransfer (SaaS di consegna referti cliniche→paziente). Niente "puoi aggiungere AI" generico.'

# ---- Persona prompts ----
read -r -d '' P_CLINIC <<'EOF' || true
Sei il DIRETTORE IT di una clinica diagnostica privata italiana (imaging + esami lab),
300 esami/mese. Hai già un gestionale proprietario (iMed/GoPenta/Softproget) con
portale paziente basic. Vendor promette integrazione FSE "entro 6 mesi". Budget
autonomo per nuovi tool: €50-200/mese. Frustrations:
- Vendor lento sugli update
- Pazienti 65+ chiamano segreteria per "come scarico il referto"
- DPO chiede log di accesso che il portale non fornisce
- Non chiaro dove/chi conserva i dati
- Invii ai medici curanti via email (non compliant GDPR)
Proponi 5 idee di prodotto add-on (NON sostitutive del gestionale) che compreresti
come cliente. Sii specifico sul pricing mensile realistico.
EOF

read -r -d '' P_PATIENT <<'EOF' || true
Sei un paziente ITALIANO di 68 ANNI. Hai fatto una risonanza magnetica al ginocchio
in clinica privata. Ti danno CD + QR. Non hai SPID. Usi WhatsApp con tuo figlio.
Frustrations:
- Non so se il CD funziona sul computer del mio medico
- QR chiede codice fiscale ogni volta
- Mio figlio a Milano vuole vedere il referto ma non può
- Fra 2 settimane ho la visita ortopedica, non so se avrò ancora accesso
- Ho perso il foglio col QR
Proponi 5 idee di strumento/servizio che semplificherebbe la tua vita. Specifica
CHI PAGA (tu? clinica? SSN?) e il pricing.
EOF

read -r -d '' P_MMG <<'EOF' || true
Sei un MEDICO DI MEDICINA GENERALE italiano, 55 anni, 1600 assistiti. Ricevi
15-30 referti/settimana dai pazienti: email con PDF, WhatsApp screenshot,
stampe, CD. Hai un gestionale tuo (Millewin) ma non integrato FSE regionale.
Frustrations:
- Referti arrivano via email, non so se posso salvarli in cartella (GDPR)
- Inbox dispersa (email, WhatsApp, appunti, stampe)
- Vorrei annotare "visto, ordinato esame controllo" sopra ogni referto
- Vorrei inoltrare allo specialista con un click
- Pazienti anziani chiamano per "non riesco ad aprire il CD"
Proponi 5 strumenti digitali che userei come MMG. Specifica "would_I_pay" in
€/mese realistico (ricorda: MMG medi sono cost-conscious).
EOF

read -r -d '' P_DPO <<'EOF' || true
Sei il DPO ESTERNO di 5 cliniche private diagnostiche in Lombardia (20-80
dipendenti ciascuna). Fatturi €400-800/mese per clinica. Aggiornatissimo su
GDPR, linee guida Garante, DPCM 3 dicembre 2013 conservazione, AgID.
Frustrations:
- Cliniche mi chiedono "siamo a norma FSE?" — audit manuali
- Gestionali vendor non forniscono registro Art. 30 GDPR stampabile
- Ricostruisco i flussi dati ad ogni audit interno
- DPA dei vendor tardano settimane
- Nessun "radar compliance" automatico per nuove normative
Proponi 5 asset di compliance-as-a-service che pagherei (io o le cliniche)
volentieri. Specifica chi compra (DPO? Direttore sanitario? Entrambi?) e
pricing per-clinica mensile.
EOF

# ---- OpenAI call (gpt-4o-mini) ----
call_openai() {
  local persona_name="$1" persona_prompt="$2"
  echo "→ OpenAI gpt-4o-mini: $persona_name" >&2
  jq -n --arg sys "$SYSTEM_PROMPT" --arg user "$persona_prompt" \
    '{model:"gpt-4o-mini", temperature:0.9, messages:[{role:"system",content:$sys},{role:"user",content:$user}]}' \
  | curl -sS https://api.openai.com/v1/chat/completions \
      -H "Authorization: Bearer $OPENAI_KEY" \
      -H "Content-Type: application/json" \
      --data-binary @- \
  | jq -r '
      if .error then "ERROR: " + .error.message
      else .choices[0].message.content + "\n\n---\nTokens: in=" + (.usage.prompt_tokens|tostring) + " out=" + (.usage.completion_tokens|tostring)
      end
    '
}

# ---- Gemini call ----
call_gemini() {
  local persona_name="$1" persona_prompt="$2" model="$3"
  echo "→ Gemini $model: $persona_name" >&2
  jq -n --arg sys "$SYSTEM_PROMPT" --arg user "$persona_prompt" \
    '{system_instruction:{parts:[{text:$sys}]}, contents:[{role:"user",parts:[{text:$user}]}], generationConfig:{temperature:0.9}}' \
  | curl -sS "https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=$GEMINI_KEY" \
      -H "Content-Type: application/json" \
      --data-binary @- \
  | jq -r '
      if .error then "ERROR: " + .error.message
      else (.candidates[0].content.parts[0].text // "NO OUTPUT") +
        "\n\n---\nTokens: in=" + ((.usageMetadata.promptTokenCount // 0)|tostring) +
        " out=" + ((.usageMetadata.candidatesTokenCount // 0)|tostring)
      end
    '
}

# ---- Run all 4 in parallel ----
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT

( call_openai "Clinica IT Director"          "$P_CLINIC"  > "$TMP/1-clinic.md"  ) &
( call_gemini "Paziente 65+"                 "$P_PATIENT" "gemini-2.0-flash" > "$TMP/2-patient.md" ) &
( call_gemini "Medico Medicina Generale"     "$P_MMG"     "gemini-2.5-pro"   > "$TMP/3-mmg.md"     ) &
( call_openai "DPO esterno / Direttore sanitario" "$P_DPO" > "$TMP/4-dpo.md"    ) &
wait

# ---- Assemble final report ----
{
  echo "# Brainstorm 4-personas — Second product MedTransfer"
  echo ""
  echo "Generato il 15 aprile 2026. 4 persone × 5 idee ciascuna. Modelli usati:"
  echo "OpenAI gpt-4o-mini (clinica + DPO), Gemini 2.0 Flash (paziente), Gemini 2.5 Pro (MMG)."
  echo ""
  echo "---"
  echo ""
  echo "## 1. Persona: Clinica — IT Director (OpenAI gpt-4o-mini)"
  cat "$TMP/1-clinic.md"
  echo ""
  echo "---"
  echo ""
  echo "## 2. Persona: Paziente 68 anni (Gemini 2.0 Flash)"
  cat "$TMP/2-patient.md"
  echo ""
  echo "---"
  echo ""
  echo "## 3. Persona: MMG 55 anni (Gemini 2.5 Pro)"
  cat "$TMP/3-mmg.md"
  echo ""
  echo "---"
  echo ""
  echo "## 4. Persona: DPO esterno (OpenAI gpt-4o-mini)"
  cat "$TMP/4-dpo.md"
} > "$OUT"

echo ""
echo "✅ Brainstorm completed → $OUT"
