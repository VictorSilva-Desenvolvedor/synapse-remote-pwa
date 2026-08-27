# Synapse Remote — Mobile PWA

Aplicativo Web Progressivo (PWA) 100% estático para controle remoto e monitoramento do seu computador via **GitHub Relay**, integrado ao ecossistema [Synapse](https://github.com/VictorSilva-Desenvolvedor/Synapse).

---

## 🔒 Arquitetura de Segurança

1. **Sem Servidores Intermediários:** A aplicação roda 100% no navegador e comunica-se diretamente com a API REST oficial do GitHub (`https://api.github.com`).
2. **Armazenamento Seguro Local:** O token de acesso pessoal (PAT) fica armazenado exclusivamente no `localStorage` do seu navegador no dispositivo e **nunca** é enviado para terceiros.
3. **Recomendação de Token Dedicado:** Recomenda-se criar um token **Fine-Grained** no GitHub com permissões restritas de *Read & Write* apenas para *Contents* no repositório privado do cofre. Em caso de perda ou roubo do celular, você pode revogar apenas esse token no GitHub sem afetar a sincronização principal do Synapse no PC.
4. **Confirmação Humana no PC:** Ações sensíveis (`TypeText` e `ClickElement`) exigem confirmação interativa com timeout de 30s na tela do computador antes de serem executadas.

---

## 📱 Como Usar e Instalar no Celular

### 1. Acesso
Acesse o aplicativo hospedado via GitHub Pages:
👉 **[https://victorsilva-desenvolvedor.github.io/synapse-remote-pwa/](https://victorsilva-desenvolvedor.github.io/synapse-remote-pwa/)**

### 2. Instalação como App Nativo (PWA)
- **iOS (Safari):** Toque no botão de compartilhamento e selecione **"Adicionar à Tela de Início"**.
- **Android (Chrome):** Toque nos três pontos do menu e selecione **"Instalar aplicativo"** ou **"Adicionar à tela inicial"**.

### 3. Configuração Inicial
1. Informe o **Owner** (ex: `VictorSilva-Desenvolvedor`).
2. Informe o **Repositório** do cofre privado (ex: `Synapse-Vault`).
3. Informe a **Branch** (padrão: `main`).
4. Cole o seu **Personal Access Token** (PAT).
5. Clique em **"Testar Conexão"** e em seguida em **"Salvar Configurações"**.

---

## ⚡ Comandos Suportados

- **AskVault (RAG):** Pergunta em linguagem natural ao cofre do Obsidian. O Synapse Brain no PC realiza busca vetorial semântica e gera a resposta com IA citando as fontes em `[[Wikilinks]]` (não requer confirmação por ser somente leitura).
- **OpenApp:** Abre um aplicativo permitido no PC (ex: `notepad`, `obsidian`, `calc`).
- **OpenNote:** Abre uma nota Markdown do cofre local com validação estrita anti-path traversal (ex: `Notas/MinhaNota.md`).
- **FocusWindow:** Traz a janela do processo alvo para primeiro plano.
- **TypeText:** Foca a janela do processo permitido e digita o texto fornecido via entrada Unicode segura (exige confirmação no PC).
- **ClickElement:** Localiza um elemento de interface por `NameProperty` via UI Automation e dispara o clique (exige confirmação no PC).
- **Histórico:** Visualiza o registro append-only de auditoria gravado em `.synapse/remote-audit.log`.

---

## 🛠️ Desenvolvimento Local

Por ser 100% estático, basta abrir o `index.html` em qualquer navegador ou servir localmente:

```bash
npx serve .
```
