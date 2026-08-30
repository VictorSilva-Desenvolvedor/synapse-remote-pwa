// Synapse Remote PWA Logic — Fases 1, 2, 3 e 4 (AskVault RAG)
(function () {
  'use strict';

  const STORAGE_KEY = 'synapse_pwa_config';
  let isPolling = false;
  let activePollingInterval = null;
  let isAskPolling = false;
  let activeAskPollingInterval = null;

  // DOM Elements
  const tabs = document.querySelectorAll('.nav-tab');
  const panes = document.querySelectorAll('.tab-pane');
  const connectionBadge = document.getElementById('connectionBadge');
  const connectionStatusText = document.getElementById('connectionStatusText');
  const statusDot = connectionBadge.querySelector('.status-dot');

  // Config Form Elements
  const configForm = document.getElementById('configForm');
  const cfgOwner = document.getElementById('cfgOwner');
  const cfgRepo = document.getElementById('cfgRepo');
  const cfgBranch = document.getElementById('cfgBranch');
  const cfgToken = document.getElementById('cfgToken');
  const btnTestConnection = document.getElementById('btnTestConnection');
  const testSpinner = document.getElementById('testSpinner');
  const btnToggleTokenVisibility = document.getElementById('btnToggleTokenVisibility');

  // AskVault (Tab 1) Elements
  const askVaultForm = document.getElementById('askVaultForm');
  const askQuestionInput = document.getElementById('askQuestionInput');
  const btnSendAsk = document.getElementById('btnSendAsk');
  const btnSendAskText = document.getElementById('btnSendAskText');
  const askSpinner = document.getElementById('askSpinner');

  const askResponseCard = document.getElementById('askResponseCard');
  const askBadge = document.getElementById('askBadge');
  const askResponseBody = document.getElementById('askResponseBody');
  const askProgressContainer = document.getElementById('askProgressContainer');
  const askSourcesBox = document.getElementById('askSourcesBox');
  const askSourcesChips = document.getElementById('askSourcesChips');

  // Command Form (Tab 2) Elements
  const commandForm = document.getElementById('commandForm');
  const cmdTypeSelect = document.getElementById('cmdTypeSelect');
  const dynamicFieldsContainer = document.getElementById('dynamicFieldsContainer');
  const btnSendCommand = document.getElementById('btnSendCommand');
  const btnSendText = document.getElementById('btnSendText');
  const sendSpinner = document.getElementById('sendSpinner');

  const executionCard = document.getElementById('executionCard');
  const executionBadge = document.getElementById('executionBadge');
  const executionStatusMsg = document.getElementById('executionStatusMsg');
  const commandMeta = document.getElementById('commandMeta');

  // History (Tab 3) Elements
  const historyList = document.getElementById('historyList');
  const historyLoading = document.getElementById('historyLoading');
  const historyEmpty = document.getElementById('historyEmpty');
  const btnRefreshHistory = document.getElementById('btnRefreshHistory');

  // Toast
  const toastBanner = document.getElementById('toastBanner');
  const toastContent = document.getElementById('toastContent');
  const toastCloseBtn = document.getElementById('toastCloseBtn');

  // UTF-8 Base64 Helpers
  function utf8ToBase64(str) {
    return window.btoa(unescape(encodeURIComponent(str)));
  }

  function base64ToUtf8(str) {
    const decoded = decodeURIComponent(escape(window.atob(str.replace(/\s/g, ''))));
    // Arquivos gravados pelo Host no PC podem vir com BOM UTF-8 (comportamento padrao do
    // Encoding.UTF8 do .NET ao escrever arquivo) - um caractere invisivel no inicio que
    // quebra JSON.parse com "Unexpected token". Sem isso, qualquer resultado remoto ficava
    // preso em "Pensando..." para sempre: o polling ja tinha parado (achou o 200 e limpou
    // o interval) mas o parse falhava logo em seguida, e o catch engolia o erro em silencio.
    return decoded.charCodeAt(0) === 0xFEFF ? decoded.slice(1) : decoded;
  }

  // Toast Banner
  function showToast(message, type = 'success') {
    toastBanner.className = `toast-banner ${type}`;
    toastContent.textContent = message;
    toastBanner.classList.remove('hidden');
    setTimeout(() => {
      toastBanner.classList.add('hidden');
    }, 6000);
  }

  toastCloseBtn.addEventListener('click', () => {
    toastBanner.classList.add('hidden');
  });

  // Config Management
  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveConfig(config) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    updateConnectionUI(true);
  }

  function updateConnectionUI(isConnected) {
    if (isConnected) {
      statusDot.className = 'status-dot connected';
      connectionStatusText.textContent = 'Conectado';
    } else {
      statusDot.className = 'status-dot error';
      connectionStatusText.textContent = 'Não Conectado';
    }
  }

  // Tab Navigation
  function switchTab(targetTabId) {
    tabs.forEach(tab => {
      const isActive = tab.getAttribute('data-tab') === targetTabId;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-expanded', isActive ? 'true' : 'false');
    });

    panes.forEach(pane => {
      pane.classList.toggle('active', pane.id === targetTabId);
    });

    if (targetTabId === 'historyTab') {
      fetchHistory();
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.getAttribute('data-tab'));
    });
  });

  // Toggle Password Visibility
  btnToggleTokenVisibility.addEventListener('click', () => {
    if (cfgToken.type === 'password') {
      cfgToken.type = 'text';
    } else {
      cfgToken.type = 'password';
    }
  });

  // Dynamic Fields for Command Type (Tab 2)
  function renderDynamicFields(type) {
    dynamicFieldsContainer.innerHTML = '';

    switch (type) {
      case 'AskVault':
        dynamicFieldsContainer.innerHTML = `
          <div class="form-group">
            <label for="field_question">Pergunta ao Cofre</label>
            <textarea id="field_question" class="form-control" placeholder="ex: O que eu anotei sobre a arquitetura do projeto?" required rows="3"></textarea>
            <small class="form-hint">🧠 Processa busca semântica vetorial e RAG com IA contra as notas do cofre no PC.</small>
          </div>
        `;
        break;

      case 'OpenApp':
        dynamicFieldsContainer.innerHTML = `
          <div class="form-group">
            <label for="field_app">Nome ou Chave do Aplicativo Permitido</label>
            <input type="text" id="field_app" class="form-control" placeholder="ex: notepad, obsidian, calc" required autocomplete="off">
            <small class="form-hint">Deve constar na allowlist <code>RemoteAllowedApps</code> configurada no PC.</small>
          </div>
        `;
        break;

      case 'OpenNote':
        dynamicFieldsContainer.innerHTML = `
          <div class="form-group">
            <label for="field_relativePath">Caminho Relativo da Nota no Cofre</label>
            <input type="text" id="field_relativePath" class="form-control" placeholder="ex: Notas/MinhaNota.md ou Projetos/Ideias.md" required autocomplete="off">
            <small class="form-hint">O caminho é restrito ao interior do cofre raiz (proteção anti-path traversal).</small>
          </div>
        `;
        break;

      case 'FocusWindow':
        dynamicFieldsContainer.innerHTML = `
          <div class="form-group">
            <label for="field_processName">Nome do Processo</label>
            <input type="text" id="field_processName" class="form-control" placeholder="ex: notepad, Obsidian, chrome" required autocomplete="off">
            <small class="form-hint">Traz a janela visível do processo em execução para o primeiro plano.</small>
          </div>
        `;
        break;

      case 'TypeText':
        dynamicFieldsContainer.innerHTML = `
          <div class="form-group">
            <label for="field_processName">Nome do Processo Alvo</label>
            <input type="text" id="field_processName" class="form-control" placeholder="ex: notepad ou Obsidian" required autocomplete="off">
            <small class="form-hint">Processo permitido na allowlist que receberá o texto.</small>
          </div>
          <div class="form-group">
            <label for="field_text">Texto a ser digitado</label>
            <textarea id="field_text" class="form-control" placeholder="Digite o texto a ser enviado via entrada Unicode segura..." required></textarea>
            <small class="form-hint">⚠️ Ação Sensível: exibirá um diálogo de confirmação de 30s na tela do PC.</small>
          </div>
        `;
        break;

      case 'ClickElement':
        dynamicFieldsContainer.innerHTML = `
          <div class="form-group">
            <label for="field_processName">Nome do Processo Alvo</label>
            <input type="text" id="field_processName" class="form-control" placeholder="ex: notepad ou Obsidian" required autocomplete="off">
          </div>
          <div class="form-group">
            <label for="field_elementName">Nome do Elemento de UI (NameProperty)</label>
            <input type="text" id="field_elementName" class="form-control" placeholder="ex: Arquivo, Salvar, Sync Now" required autocomplete="off">
            <small class="form-hint">⚠️ Ação Sensível: aciona o elemento via UI Automation após aprovação humana no PC.</small>
          </div>
        `;
        break;
    }
  }

  cmdTypeSelect.addEventListener('change', (e) => {
    renderDynamicFields(e.target.value);
  });

  // Test Connection to GitHub
  async function testGitHubConnection(owner, repo, token) {
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`GitHub API (${response.status}): ${err.message || 'Falha de autenticação'}`);
    }

    return await response.json();
  }

  btnTestConnection.addEventListener('click', async () => {
    const owner = cfgOwner.value.trim();
    const repo = cfgRepo.value.trim();
    const token = cfgToken.value.trim();

    if (!owner || !repo || !token) {
      showToast('Preencha Owner, Repositório e Token para testar.', 'error');
      return;
    }

    testSpinner.classList.remove('hidden');
    btnTestConnection.disabled = true;

    try {
      const repoData = await testGitHubConnection(owner, repo, token);
      showToast(`Conexão OK! Repositório: ${repoData.full_name} (${repoData.private ? 'Privado' : 'Público'})`, 'success');
      updateConnectionUI(true);
    } catch (ex) {
      showToast(`Erro na conexão: ${ex.message}`, 'error');
      updateConnectionUI(false);
    } finally {
      testSpinner.classList.add('hidden');
      btnTestConnection.disabled = false;
    }
  });

  // Save Config Form
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const config = {
      owner: cfgOwner.value.trim(),
      repo: cfgRepo.value.trim(),
      branch: cfgBranch.value.trim() || 'main',
      token: cfgToken.value.trim()
    };

    saveConfig(config);
    showToast('Configurações salvas no navegador com sucesso!', 'success');
    switchTab('askTab');
  });

  // Helper UUID
  function generateCommandId() {
    return (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }));
  }

  // TAB 1: ASK VAULT (RAG Query) Form Handler
  askVaultForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const config = loadConfig();
    if (!config || !config.token) {
      showToast('Configure as credenciais do repositório primeiro.', 'error');
      switchTab('configTab');
      return;
    }

    const question = askQuestionInput.value.trim();
    if (!question) {
      showToast('Digite uma pergunta para consultar o cofre.', 'error');
      return;
    }

    const commandId = generateCommandId();
    const remoteCommand = {
      id: commandId,
      createdAt: new Date().toISOString(),
      type: 'AskVault',
      payload: { question: question },
      requestedBy: 'mobile-pwa'
    };

    btnSendAsk.disabled = true;
    askSpinner.classList.remove('hidden');
    btnSendAskText.textContent = 'Consultando...';

    askResponseCard.classList.remove('hidden');
    askProgressContainer.classList.remove('hidden');
    askBadge.className = 'badge badge-pending';
    askBadge.textContent = 'Enviando...';
    askResponseBody.textContent = 'Enviando pergunta para o PC via GitHub Relay...';
    askSourcesBox.classList.add('hidden');
    askSourcesChips.innerHTML = '';

    try {
      const commandJson = JSON.stringify(remoteCommand, null, 2);
      const base64Content = utf8ToBase64(commandJson);
      const uploadUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/.synapse/remote/commands/${commandId}.json`;

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Remote: AskVault (${commandId.substring(0, 8)})`,
          content: base64Content,
          branch: config.branch
        })
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({ message: uploadRes.statusText }));
        throw new Error(`Falha no upload (${uploadRes.status}): ${err.message}`);
      }

      askBadge.textContent = 'Pensando...';
      askResponseBody.textContent = 'Pergunta entregue ao PC! O Synapse Brain está pesquisando o cofre e gerando a resposta com IA...';

      startAskResultPolling(commandId, config);
    } catch (ex) {
      askBadge.className = 'badge badge-danger';
      askBadge.textContent = 'Erro';
      askResponseBody.textContent = `❌ ${ex.message}`;
      askProgressContainer.classList.add('hidden');
      btnSendAsk.disabled = false;
      askSpinner.classList.add('hidden');
      btnSendAskText.textContent = 'Consultar Cérebro';
    }
  });

  // Polling de Resultado para AskVault
  function startAskResultPolling(commandId, config) {
    if (isAskPolling && activeAskPollingInterval) {
      clearInterval(activeAskPollingInterval);
    }

    isAskPolling = true;
    const startTime = Date.now();
    const timeoutMs = 75000; // 75s timeout
    const resultUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/.synapse/remote/results/${commandId}.json?ref=${encodeURIComponent(config.branch)}`;

    activeAskPollingInterval = setInterval(async () => {
      const elapsed = Date.now() - startTime;

      if (elapsed > timeoutMs) {
        clearInterval(activeAskPollingInterval);
        isAskPolling = false;
        askBadge.className = 'badge badge-danger';
        askBadge.textContent = 'Timeout (75s)';
        // O texto anterior mandava conferir a chave do Gemini. Desde o fallback
        // automatico Gemini->Ollama no PC (repo Synapse, commit 501fa9e), o AskVault
        // responde tambem sem chave nenhuma — a instrucao mandava consertar algo que
        // nao esta quebrado. Sobra o PC nao estar rodando, ou ter passado da janela:
        // neste segundo caso a resposta ainda chega, so que depois deste texto.
        askResponseBody.textContent = 'O PC não respondeu em 75s. Verifique se o Synapse está em execução. Se ele estiver apenas lento, a resposta ainda será gravada no cofre — refaça a pergunta para buscá-la.';
        askProgressContainer.classList.add('hidden');
        btnSendAsk.disabled = false;
        askSpinner.classList.add('hidden');
        btnSendAskText.textContent = 'Consultar Cérebro';
        return;
      }

      try {
        const res = await fetch(resultUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${config.token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (res.status === 200) {
          clearInterval(activeAskPollingInterval);
          isAskPolling = false;
          const data = await res.json();
          const resultContent = base64ToUtf8(data.content);
          const resultObj = JSON.parse(resultContent);

          renderAskResult(resultObj);
        }
      } catch {
        // Ignora falhas temporárias no polling
      }
    }, 3000);
  }

  function renderAskResult(result) {
    btnSendAsk.disabled = false;
    askSpinner.classList.add('hidden');
    btnSendAskText.textContent = 'Consultar Cérebro';
    askProgressContainer.classList.add('hidden');

    const status = result.status || result.Status;
    const message = result.message || result.Message || '';

    if (status === 'Success' || status === 0) {
      askBadge.className = 'badge badge-success';
      askBadge.textContent = 'Respondido';

      // Separa fontes se houver linha "Fontes: [[...]]"
      const sourcesIndex = message.indexOf('Fontes:');
      if (sourcesIndex !== -1) {
        const textOnly = message.substring(0, sourcesIndex).trim();
        const sourcesText = message.substring(sourcesIndex);
        askResponseBody.textContent = textOnly;

        const wikiMatches = sourcesText.match(/\[\[(.*?)\]\]/g);
        if (wikiMatches && wikiMatches.length > 0) {
          askSourcesBox.classList.remove('hidden');
          askSourcesChips.innerHTML = '';
          wikiMatches.forEach(w => {
            const chip = document.createElement('span');
            chip.className = 'source-chip';
            chip.textContent = `📄 ${w}`;
            askSourcesChips.appendChild(chip);
          });
        }
      } else {
        askResponseBody.textContent = message;
        askSourcesBox.classList.add('hidden');
      }
    } else if (status === 'Rejected' || status === 2) {
      askBadge.className = 'badge badge-danger';
      askBadge.textContent = 'Rejeitado';
      askResponseBody.textContent = `⛔ ${message}`;
      askSourcesBox.classList.add('hidden');
    } else {
      askBadge.className = 'badge badge-danger';
      askBadge.textContent = 'Falha';
      askResponseBody.textContent = `❌ ${message}`;
      askSourcesBox.classList.add('hidden');
    }
  }

  // TAB 2: SEND REMOTE COMMAND
  commandForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const config = loadConfig();
    if (!config || !config.token) {
      showToast('Configure as credenciais do repositório primeiro.', 'error');
      switchTab('configTab');
      return;
    }

    const type = cmdTypeSelect.value;
    const payload = {};

    switch (type) {
      case 'AskVault':
        payload.question = document.getElementById('field_question').value.trim();
        break;
      case 'OpenApp':
        payload.app = document.getElementById('field_app').value.trim();
        break;
      case 'OpenNote':
        payload.relativePath = document.getElementById('field_relativePath').value.trim();
        break;
      case 'FocusWindow':
        payload.processName = document.getElementById('field_processName').value.trim();
        break;
      case 'TypeText':
        payload.processName = document.getElementById('field_processName').value.trim();
        payload.text = document.getElementById('field_text').value;
        break;
      case 'ClickElement':
        payload.processName = document.getElementById('field_processName').value.trim();
        payload.elementName = document.getElementById('field_elementName').value.trim();
        break;
    }

    const commandId = generateCommandId();

    const remoteCommand = {
      id: commandId,
      createdAt: new Date().toISOString(),
      type: type,
      payload: payload,
      requestedBy: 'mobile-pwa'
    };

    btnSendCommand.disabled = true;
    sendSpinner.classList.remove('hidden');
    btnSendText.textContent = 'Enviando...';

    executionCard.classList.remove('hidden');
    executionBadge.className = 'badge badge-pending';
    executionBadge.textContent = 'Enviando Comando...';
    executionStatusMsg.textContent = 'Fazendo upload do comando para o repositório GitHub...';
    commandMeta.textContent = JSON.stringify(remoteCommand, null, 2);

    try {
      const commandJson = JSON.stringify(remoteCommand, null, 2);
      const base64Content = utf8ToBase64(commandJson);
      const uploadUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/.synapse/remote/commands/${commandId}.json`;

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `Remote: executar ${type} (${commandId.substring(0, 8)})`,
          content: base64Content,
          branch: config.branch
        })
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({ message: uploadRes.statusText }));
        throw new Error(`Falha no upload do comando (${uploadRes.status}): ${err.message}`);
      }

      executionBadge.textContent = 'Aguardando PC...';
      const isSensitive = type === 'TypeText' || type === 'ClickElement';
      executionStatusMsg.textContent = isSensitive
        ? 'Comando registrado! Aguardando o PC processar e a confirmação humana na tela do computador...'
        : 'Comando registrado! Aguardando o agente do Synapse no PC executar...';

      startResultPolling(commandId, config);
    } catch (ex) {
      executionBadge.className = 'badge badge-danger';
      executionBadge.textContent = 'Erro';
      executionStatusMsg.textContent = ex.message;
      btnSendCommand.disabled = false;
      sendSpinner.classList.add('hidden');
      btnSendText.textContent = 'Enviar para o PC';
    }
  });

  // Polling de Resultados para Comandos Gerais
  function startResultPolling(commandId, config) {
    if (isPolling && activePollingInterval) {
      clearInterval(activePollingInterval);
    }

    isPolling = true;
    const startTime = Date.now();
    const timeoutMs = 65000;
    const resultUrl = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/.synapse/remote/results/${commandId}.json?ref=${encodeURIComponent(config.branch)}`;

    activePollingInterval = setInterval(async () => {
      const elapsed = Date.now() - startTime;

      if (elapsed > timeoutMs) {
        clearInterval(activePollingInterval);
        isPolling = false;
        executionBadge.className = 'badge badge-danger';
        executionBadge.textContent = 'Timeout (60s)';
        executionStatusMsg.textContent = 'O PC não respondeu dentro de 60 segundos. Verifique se o Synapse Tray está em execução com "Controle Remoto: Ativado".';
        btnSendCommand.disabled = false;
        sendSpinner.classList.add('hidden');
        btnSendText.textContent = 'Enviar para o PC';
        return;
      }

      try {
        const res = await fetch(resultUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${config.token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (res.status === 200) {
          clearInterval(activePollingInterval);
          isPolling = false;
          const data = await res.json();
          const resultContent = base64ToUtf8(data.content);
          const resultObj = JSON.parse(resultContent);

          renderExecutionResult(resultObj);
        }
      } catch {
        // Ignora erros transitórios de polling
      }
    }, 3000);
  }

  function renderExecutionResult(result) {
    btnSendCommand.disabled = false;
    sendSpinner.classList.add('hidden');
    btnSendText.textContent = 'Enviar para o PC';

    const status = result.status || result.Status;
    const message = result.message || result.Message || '';

    if (status === 'Success' || status === 0) {
      executionBadge.className = 'badge badge-success';
      executionBadge.textContent = 'Sucesso';
      executionStatusMsg.textContent = `✅ ${message || 'Ação executada com sucesso.'}`;
    } else if (status === 'Rejected' || status === 2) {
      executionBadge.className = 'badge badge-danger';
      executionBadge.textContent = 'Rejeitado';
      executionStatusMsg.textContent = `⛔ ${message || 'Ação rejeitada ou não confirmada.'}`;
    } else {
      executionBadge.className = 'badge badge-danger';
      executionBadge.textContent = 'Falha';
      executionStatusMsg.textContent = `❌ ${message || 'Falha na execução.'}`;
    }
  }

  // TAB 3: FETCH HISTORY (.synapse/remote-audit.log)
  async function fetchHistory() {
    const config = loadConfig();
    if (!config || !config.token) {
      historyEmpty.classList.remove('hidden');
      historyList.innerHTML = '';
      return;
    }

    historyLoading.classList.remove('hidden');
    historyEmpty.classList.add('hidden');
    historyList.innerHTML = '';

    const url = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/.synapse/remote-audit.log?ref=${encodeURIComponent(config.branch)}`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (res.status === 404) {
        historyLoading.classList.add('hidden');
        historyEmpty.classList.remove('hidden');
        return;
      }

      if (!res.ok) {
        throw new Error(`Erro ao buscar histórico (${res.status})`);
      }

      const data = await res.json();
      const logText = base64ToUtf8(data.content);
      const lines = logText.split(/\r?\n/).filter(line => line.trim().length > 0);

      if (lines.length === 0) {
        historyLoading.classList.add('hidden');
        historyEmpty.classList.remove('hidden');
        return;
      }

      const entries = [];
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch { }
      }

      // Ordena decrescente por data
      entries.sort((a, b) => new Date(b.Timestamp || b.timestamp || 0) - new Date(a.Timestamp || a.timestamp || 0));

      historyLoading.classList.add('hidden');
      renderHistoryEntries(entries);
    } catch (ex) {
      historyLoading.classList.add('hidden');
      showToast(`Erro ao carregar histórico: ${ex.message}`, 'error');
    }
  }

  function renderHistoryEntries(entries) {
    historyList.innerHTML = '';

    entries.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const status = entry.Status || entry.status || 'Unknown';
      const type = entry.Type || entry.type || 'Comando';
      const timestamp = entry.Timestamp ? new Date(entry.Timestamp).toLocaleString('pt-BR') : 'Data não disponível';
      const message = entry.Message || entry.message || 'Sem mensagem';
      const confirmation = entry.Confirmation || entry.confirmation;
      const requestedBy = entry.RequestedBy || entry.requestedBy || 'N/A';

      let statusBadgeClass = 'badge-pending';
      if (status === 'Success') statusBadgeClass = 'badge-success';
      if (status === 'Rejected' || status === 'Failed') statusBadgeClass = 'badge-danger';

      card.innerHTML = `
        <div class="history-header">
          <span class="history-type">${type}</span>
          <span class="badge ${statusBadgeClass}">${status}</span>
        </div>
        <div class="history-msg">${message}</div>
        <div class="history-meta">
          <span>🕒 ${timestamp}</span>
          <span>👤 ${requestedBy}</span>
          ${confirmation ? `<span>🛡️ Confirmação: ${confirmation}</span>` : ''}
        </div>
      `;

      historyList.appendChild(card);
    });
  }

  btnRefreshHistory.addEventListener('click', () => {
    fetchHistory();
  });

  // PWA Service Worker Registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(() => console.log('Synapse Remote ServiceWorker registrado.'))
        .catch(err => console.warn('ServiceWorker falhou:', err));
    });
  }

  // Initialization
  const initialConfig = loadConfig();
  if (initialConfig) {
    cfgOwner.value = initialConfig.owner || '';
    cfgRepo.value = initialConfig.repo || '';
    cfgBranch.value = initialConfig.branch || 'main';
    cfgToken.value = initialConfig.token || '';
    updateConnectionUI(true);
    renderDynamicFields(cmdTypeSelect.value);
  } else {
    updateConnectionUI(false);
    renderDynamicFields(cmdTypeSelect.value);
    switchTab('configTab');
  }

})();
