import { GameState, Move, MoveResult, Position, Color, PieceType, BoardConfig } from './types.js';
import { createInitialState, getPiece, loadGameConfig, serializeState, deserializeState } from './board.js';
import { getLegalMoves, getAllLegalMoves, isInCheck, findKing } from './moves.js';
import { makeMove, getGameStatus, isGameOver, isVictory } from './game.js';
import { findBestMove, getPieceValue } from './ai.js';
import { getPiecePaths, setPiecesBasePath } from './piece-assets.js';
import { posToString } from './board.js';
import { getPieceConfig, setPieceConfig } from './piece-config.js';
import { cloneState } from './board.js';
import { GameConfig } from './types.js';

const GAME_CONFIGS = [
  'assets/games/standard.json',
  'assets/games/mate-in-2.json',
  'assets/games/labyrinth.json',
  'assets/games/knight-tour.json',
  'assets/games/checkers.json',
  'assets/games/checkers-blitz.json',
];

interface SkinConfig {
  id: string;
  name: string;
  piecesPath: string;
  boardCss: string;
}

interface PersistedSettings {
  gameUrl?: string;
  skinId?: string;
  mode?: 'pvp' | 'ai';
  playerColor?: Color;
  flipBoard?: boolean;
  levelIndex?: number;
}

const SETTINGS_KEY = 'chessgame_settings';
const GAME_SAVE_KEY = 'chessgame_save';

class ChessGame {
  private state!: GameState;
  private selectedSquare: Position | null = null;
  private validMoves: Move[] = [];
  private lastMove: Move | null = null;
  private playerColor: Color = 'white';
  private mode: 'pvp' | 'ai' = 'pvp';
  private flipBoard = false;
  private aiThinking = false;
  private promotionPending: { from: Position; to: Position; color: Color } | null = null;
  private multiCaptureActive = false;
  private multiCapturePos: Position | null = null;
  private moveHistory: { white?: string; whiteTime?: string; black?: string; blackTime?: string; undo?: boolean; check?: string; mate?: string }[] = [];
  private stateHistory: GameState[] = [];
  private gameStartTime = 0;
  private moveStartTime = 0;
  private whiteTotalTime = 0;
  private blackTotalTime = 0;
  private whiteMoveCount = 0;
  private blackMoveCount = 0;
  private gameConfigs: Map<string, GameConfig> = new Map();
  private currentConfigUrl = GAME_CONFIGS[0];
  private skins: Map<string, SkinConfig> = new Map();
  private currentSkinId = 'default';
  private currentLevelIndex = 0;
  private levelProgress = new Map<string, { completed: number[] }>();
  private levelCompletedThisSession = false;
  private moveTimerInterval: number | null = null;
  private moveTimerDeadline = 0;
  private gameTimerInterval: number | null = null;
  private gameTimerDeadline = 0;
  private whiteCaptures = 0;
  private blackCaptures = 0;
  private whiteScore = 0;
  private blackScore = 0;
  private captureHistory: { whiteCaptures: number; blackCaptures: number; whiteScore: number; blackScore: number }[] = [];

  constructor() {
    this.init();
  }

  private async loadGameConfigs(): Promise<void> {
    for (const url of GAME_CONFIGS) {
      try {
        const config = await loadGameConfig(url);
        this.gameConfigs.set(url, config);
      } catch (e) {
        console.error('Failed to load game config:', url, e);
      }
    }
  }

  private populateGameSelect(): void {
    const select = document.getElementById('game-select') as HTMLSelectElement;
    if (!select) return;
    select.innerHTML = '';
    for (const [url, config] of this.gameConfigs) {
      const option = document.createElement('option');
      option.value = url;
      option.textContent = config.name;
      select.appendChild(option);
    }
    select.value = this.currentConfigUrl;
  }

  private populateLevelSelect(): void {
    const wrapper = document.getElementById('level-select-wrapper') as HTMLLabelElement;
    const select = document.getElementById('level-select') as HTMLSelectElement;
    const list = document.getElementById('level-list') as HTMLDivElement;
    if (!wrapper || !select || !list) return;

    const config = this.gameConfigs.get(this.currentConfigUrl);
    const levels = config?.levels;
    const mode = config?.levelSelect ?? 'disabled';

    if (!levels) {
      wrapper.style.display = 'none';
      list.style.display = 'none';
      return;
    }

    const progress = this.loadLevelProgress();

    if (mode === 'disabled') {
      wrapper.style.display = 'none';
      list.style.display = 'flex';
      list.innerHTML = '';

      for (let i = 0; i < levels.length; i++) {
        const item = document.createElement('div');
        item.className = 'level-item';

        const isCompleted = progress.completed.includes(i);
        const isCurrent = i === this.currentLevelIndex;
        const isUnlocked = i === 0 || progress.completed.includes(i - 1) || isCompleted;

        if (isCompleted) {
          item.classList.add('completed');
        } else if (isCurrent) {
          item.classList.add('current');
        } else if (!isUnlocked) {
          item.classList.add('locked');
        }

        const nameSpan = document.createElement('span');
        nameSpan.textContent = levels[i].name;
        item.appendChild(nameSpan);

        if (isCompleted) {
          const check = document.createElement('span');
          check.className = 'level-check';
          check.textContent = '✓';
          item.appendChild(check);
        }

        list.appendChild(item);
      }
      return;
    }

    // mode === 'select' or 'random'
    wrapper.style.display = '';
    list.style.display = 'none';
    select.innerHTML = '';
    for (let i = 0; i < levels.length; i++) {
      const option = document.createElement('option');
      option.value = String(i);
      option.textContent = levels[i].name;
      const isUnlocked = i === 0 || progress.completed.includes(i - 1) || progress.completed.includes(i);
      if (mode === 'select' && !isUnlocked) {
        option.disabled = true;
      }
      select.appendChild(option);
    }
    select.value = String(this.currentLevelIndex);
  }

  private loadLevelProgress(): { completed: number[] } {
    const key = `chessgame_levels_${this.currentConfigUrl}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return { completed: [] };
  }

  private saveLevelProgress(): void {
    const key = `chessgame_levels_${this.currentConfigUrl}`;
    const progress = this.loadLevelProgress();
    localStorage.setItem(key, JSON.stringify(progress));
  }

  private completeCurrentLevel(): void {
    const config = this.gameConfigs.get(this.currentConfigUrl);
    if (!config?.levels) return;
    const progress = this.loadLevelProgress();
    if (!progress.completed.includes(this.currentLevelIndex)) {
      progress.completed.push(this.currentLevelIndex);
      const key = `chessgame_levels_${this.currentConfigUrl}`;
      localStorage.setItem(key, JSON.stringify(progress));
    }
  }

  private selectLevel(index: number): void {
    this.currentLevelIndex = index;
    this.saveSettings();
    this.clearGameSave();
    this.newGame();
  }

  private getLevelBoardConfig(): BoardConfig {
    const config = this.gameConfigs.get(this.currentConfigUrl);
    if (config?.levels && config.levels.length > 0) {
      const idx = Math.max(0, Math.min(this.currentLevelIndex, config.levels.length - 1));
      return config.levels[idx].board;
    }
    return config!.board;
  }

  private getCurrentLevelName(): string | null {
    const config = this.gameConfigs.get(this.currentConfigUrl);
    if (config?.levels && config.levels.length > 0) {
      const idx = Math.max(0, Math.min(this.currentLevelIndex, config.levels.length - 1));
      return config.levels[idx].name;
    }
    return null;
  }

  private async loadSkins(): Promise<void> {
    try {
      const res = await fetch('assets/skins/index.json');
      if (!res.ok) return;
      const skins: SkinConfig[] = await res.json();
      for (const skin of skins) {
        this.skins.set(skin.id, skin);
      }
    } catch (e) {
      console.error('Failed to load skins:', e);
    }
  }

  private populateSkinSelect(): void {
    const select = document.getElementById('skin-select') as HTMLSelectElement;
    if (!select) return;
    select.innerHTML = '';
    for (const [id, skin] of this.skins) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = skin.name;
      select.appendChild(option);
    }
    select.value = this.currentSkinId;
  }

  private loadSettings(): void {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const settings: PersistedSettings = JSON.parse(raw);
      if (settings.gameUrl && this.gameConfigs.has(settings.gameUrl)) {
        this.currentConfigUrl = settings.gameUrl;
      }
      if (settings.skinId && this.skins.has(settings.skinId)) {
        this.currentSkinId = settings.skinId;
      }
      if (settings.mode === 'pvp' || settings.mode === 'ai') {
        this.mode = settings.mode;
      }
      if (settings.playerColor === 'white' || settings.playerColor === 'black') {
        this.playerColor = settings.playerColor;
      }
      if (settings.flipBoard !== undefined) {
        this.flipBoard = settings.flipBoard;
      }
      if (settings.levelIndex !== undefined) {
        this.currentLevelIndex = settings.levelIndex;
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }

  private saveSettings(): void {
    const settings: PersistedSettings = {
      gameUrl: this.currentConfigUrl,
      skinId: this.currentSkinId,
      mode: this.mode,
      playerColor: this.playerColor,
      flipBoard: this.flipBoard,
      levelIndex: this.currentLevelIndex,
    };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  private applySettingsToUI(): void {
    const gameSelect = document.getElementById('game-select') as HTMLSelectElement;
    if (gameSelect) gameSelect.value = this.currentConfigUrl;

    const skinSelect = document.getElementById('skin-select') as HTMLSelectElement;
    if (skinSelect) skinSelect.value = this.currentSkinId;

    document.querySelectorAll('input[name="mode"]').forEach(el => {
      const radio = el as HTMLInputElement;
      radio.checked = radio.value === this.mode;
    });

    const aiColorSelect = document.getElementById('ai-color') as HTMLSelectElement;
    if (aiColorSelect) aiColorSelect.value = this.playerColor;

    const flipCheckbox = document.getElementById('flip-board') as HTMLInputElement;
    if (flipCheckbox) flipCheckbox.checked = this.flipBoard;

  }

  private applySkin(skinId: string): void {
    const skin = this.skins.get(skinId);
    if (!skin) return;
    this.currentSkinId = skinId;
    setPiecesBasePath(skin.piecesPath);
    let boardLink = document.getElementById('skin-board-css') as HTMLLinkElement;
    if (!boardLink) {
      boardLink = document.createElement('link');
      boardLink.id = 'skin-board-css';
      boardLink.rel = 'stylesheet';
      document.head.appendChild(boardLink);
    }
    boardLink.href = skin.boardCss;
    if (this.state) {
      this.render();
    }
  }

  private buildSaveObject(): any {
    const now = Date.now();
    const moveTimerRemaining = this.moveTimerInterval !== null
      ? Math.max(0, Math.ceil((this.moveTimerDeadline - now) / 1000))
      : 0;
    const gameTimerRemaining = this.gameTimerInterval !== null
      ? Math.max(0, Math.ceil((this.gameTimerDeadline - now) / 1000))
      : 0;
    return {
      version: 1,
      configUrl: this.currentConfigUrl,
      currentLevelIndex: this.currentLevelIndex,
      state: serializeState(this.state),
      selectedSquare: this.selectedSquare,
      validMoves: this.validMoves,
      lastMove: this.lastMove,
      moveHistory: this.moveHistory,
      stateHistory: this.stateHistory.map(serializeState),
      captureHistory: this.captureHistory,
      elapsedGameTime: now - this.gameStartTime,
      moveElapsedTime: now - this.moveStartTime,
      whiteTotalTime: this.whiteTotalTime,
      blackTotalTime: this.blackTotalTime,
      whiteMoveCount: this.whiteMoveCount,
      blackMoveCount: this.blackMoveCount,
      whiteCaptures: this.whiteCaptures,
      blackCaptures: this.blackCaptures,
      whiteScore: this.whiteScore,
      blackScore: this.blackScore,
      multiCaptureActive: this.multiCaptureActive,
      multiCapturePos: this.multiCapturePos,
      moveTimerRemaining,
      gameTimerRemaining,
    };
  }

  private saveGame(): void {
    try {
      localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(this.buildSaveObject()));
    } catch (e) {
      console.error('Failed to save game:', e);
    }
  }

  private saveToFile(): void {
    const save = this.buildSaveObject();
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const gameName = this.gameConfigs.get(this.currentConfigUrl)?.name ?? 'game';
    const dateStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    a.download = `${gameName}-${dateStr}.json`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  }

  private restoreFromSave(save: any): void {
    // Switch game config if needed
    if (save.configUrl && save.configUrl !== this.currentConfigUrl) {
      if (!this.gameConfigs.has(save.configUrl)) {
        throw new Error('Unknown game in save file');
      }
      this.currentConfigUrl = save.configUrl;
      this.saveSettings();
      const gameSelect = document.getElementById('game-select') as HTMLSelectElement;
      if (gameSelect) gameSelect.value = this.currentConfigUrl;
    }

    const config = this.gameConfigs.get(this.currentConfigUrl);
    if (config) {
      setPieceConfig(config.pieces);
    }

    this.currentLevelIndex = save.currentLevelIndex ?? 0;
    this.state = deserializeState(save.state);
    this.selectedSquare = save.selectedSquare ?? null;
    this.validMoves = save.validMoves ?? [];
    this.lastMove = save.lastMove ?? null;
    this.moveHistory = save.moveHistory ?? [];
    this.stateHistory = (save.stateHistory ?? []).map(deserializeState);
    this.captureHistory = save.captureHistory ?? [];
    const now = Date.now();
    this.gameStartTime = now - (save.elapsedGameTime ?? 0);
    this.moveStartTime = now - (save.moveElapsedTime ?? 0);
    this.whiteTotalTime = save.whiteTotalTime ?? 0;
    this.blackTotalTime = save.blackTotalTime ?? 0;
    this.whiteMoveCount = save.whiteMoveCount ?? 0;
    this.blackMoveCount = save.blackMoveCount ?? 0;
    this.whiteCaptures = save.whiteCaptures ?? 0;
    this.blackCaptures = save.blackCaptures ?? 0;
    this.whiteScore = save.whiteScore ?? 0;
    this.blackScore = save.blackScore ?? 0;
    this.multiCaptureActive = save.multiCaptureActive ?? false;
    this.multiCapturePos = save.multiCapturePos ?? null;
    this.aiThinking = false;
    this.promotionPending = null;
    this.levelCompletedThisSession = false;

    this.render();
    this.renderHistory();
    this.populateLevelSelect();

    if (save.moveTimerRemaining > 0 && this.state.moveTimeLimit > 0) {
      this.startMoveTimer(save.moveTimerRemaining);
    } else {
      this.updateMoveTimerDisplay(0);
    }
    if (save.gameTimerRemaining > 0 && this.state.gameTimeLimit > 0) {
      this.startGameTimer(save.gameTimerRemaining);
    } else {
      this.updateGameTimerDisplay(0);
    }

    if (this.mode === 'ai' && !isGameOver(this.state) && this.state.turn !== this.playerColor) {
      this.makeAIMove();
    }
  }

  private tryLoadGame(): boolean {
    try {
      const raw = localStorage.getItem(GAME_SAVE_KEY);
      if (!raw) return false;
      const save = JSON.parse(raw);
      if (save.configUrl !== this.currentConfigUrl) {
        this.clearGameSave();
        return false;
      }
      this.restoreFromSave(save);
      return true;
    } catch (e) {
      console.error('Failed to load game:', e);
      this.clearGameSave();
      return false;
    }
  }

  private clearGameSave(): void {
    try {
      localStorage.removeItem(GAME_SAVE_KEY);
    } catch (e) {
      console.error('Failed to clear game save:', e);
    }
  }

  private confirmRestart(onConfirm: () => void, onCancel?: () => void): void {
    const modal = document.getElementById('confirm-modal')!;
    modal.classList.add('active');

    const yesBtn = document.getElementById('confirm-yes')!;
    const noBtn = document.getElementById('confirm-no')!;

    const yesHandler = () => {
      cleanup();
      onConfirm();
    };
    const noHandler = () => {
      cleanup();
      if (onCancel) onCancel();
    };

    const cleanup = () => {
      modal.classList.remove('active');
      yesBtn.removeEventListener('click', yesHandler);
      noBtn.removeEventListener('click', noHandler);
    };

    yesBtn.addEventListener('click', yesHandler);
    noBtn.addEventListener('click', noHandler);
  }

  private startMoveTimer(remainingSeconds?: number): void {
    this.stopMoveTimer();
    if (this.state.moveTimeLimit <= 0) {
      this.updateMoveTimerDisplay(0);
      return;
    }
    const limit = remainingSeconds ?? this.state.moveTimeLimit;
    this.moveTimerDeadline = Date.now() + limit * 1000;
    this.moveTimerInterval = window.setInterval(() => {
      const remaining = Math.ceil((this.moveTimerDeadline - Date.now()) / 1000);
      this.updateMoveTimerDisplay(remaining);
      if (remaining <= 0) {
        this.onMoveTimeout();
      }
    }, 200);
    this.updateMoveTimerDisplay(limit);
  }

  private stopMoveTimer(): void {
    if (this.moveTimerInterval !== null) {
      clearInterval(this.moveTimerInterval);
      this.moveTimerInterval = null;
    }
  }

  private updateMoveTimerDisplay(remaining: number): void {
    const el = document.getElementById('move-timer');
    if (!el) return;
    if (this.state.moveTimeLimit <= 0) {
      el.textContent = '';
      el.className = '';
      return;
    }
    el.textContent = remaining > 0 ? `${remaining}s` : '0s';
    el.className = remaining <= 5 ? 'timer-warning' : '';
  }

  private onMoveTimeout(): void {
    this.stopMoveTimer();
    this.aiThinking = true;
    const winner = this.state.turn === 'white' ? 'Чёрные' : 'Белые';
    document.getElementById('status')!.textContent = `Время вышло! ${winner} победили`;
  }

  private startGameTimer(remainingSeconds?: number): void {
    this.stopGameTimer();
    if (this.state.gameTimeLimit <= 0) {
      this.updateGameTimerDisplay(0);
      return;
    }
    const limit = remainingSeconds ?? this.state.gameTimeLimit * 60;
    this.gameTimerDeadline = Date.now() + limit * 1000;
    this.gameTimerInterval = window.setInterval(() => {
      const remaining = Math.ceil((this.gameTimerDeadline - Date.now()) / 1000);
      this.updateGameTimerDisplay(remaining);
      if (remaining <= 0) {
        this.onGameTimeout();
      }
    }, 500);
    this.updateGameTimerDisplay(limit);
  }

  private stopGameTimer(): void {
    if (this.gameTimerInterval !== null) {
      clearInterval(this.gameTimerInterval);
      this.gameTimerInterval = null;
    }
  }

  private updateGameTimerDisplay(remainingSeconds: number): void {
    const el = document.getElementById('game-timer');
    if (!el) return;
    if (this.state.gameTimeLimit <= 0) {
      el.textContent = '';
      return;
    }
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    el.className = remainingSeconds <= 30 ? 'timer-warning' : '';
  }

  private updateMoveCounterDisplay(): void {
    const el = document.getElementById('move-counter');
    if (!el) return;
    if (this.state.moveCountLimit <= 0) {
      el.textContent = '';
      return;
    }
    const remaining = this.state.moveCountLimit - this.state.fullmoveNumber + (this.state.turn === 'white' ? 1 : 0);
    el.textContent = `Ходов осталось: ${remaining}`;
    el.className = remaining <= 1 ? 'timer-warning' : '';
  }

  private onGameTimeout(): void {
    this.stopGameTimer();
    this.stopMoveTimer();
    this.state.gameTimedOut = true;
    this.aiThinking = true;

    let winnerName: string;
    if (this.whiteScore > this.blackScore) {
      winnerName = 'Белые';
    } else if (this.blackScore > this.whiteScore) {
      winnerName = 'Чёрные';
    } else {
      winnerName = 'Ничья';
    }
    const reason = this.whiteScore !== this.blackScore
      ? `${winnerName} победили по очкам! ${this.whiteScore} : ${this.blackScore}`
      : `Ничья! ${this.whiteScore} : ${this.blackScore}`;
    document.getElementById('status')!.textContent = `Время вышло! ${reason}`;
    this.updateStatus();
  }

  private async init(): Promise<void> {
    await this.loadGameConfigs();
    await this.loadSkins();
    this.loadSettings();
    this.setupUI();
    this.populateGameSelect();
    this.populateSkinSelect();
    this.populateLevelSelect();
    this.applySettingsToUI();
    this.applySkin(this.currentSkinId);
    const loaded = this.tryLoadGame();
    if (!loaded) {
      const config = this.gameConfigs.get(this.currentConfigUrl);
      if (config?.levelSelect === 'random' && config.levels && config.levels.length > 0) {
        this.currentLevelIndex = Math.floor(Math.random() * config.levels.length);
      }
      await this.newGame();
      this.saveGame();
      if (this.mode === 'ai' && this.playerColor === 'black') {
        this.makeAIMove();
      }
    }
  }

  private setupUI(): void {
    document.getElementById('new-game')!.addEventListener('click', () => {
      this.clearGameSave();
      this.newGame();
    });
    document.getElementById('undo-move')!.addEventListener('click', () => this.undoMove());
    document.getElementById('save-game')!.addEventListener('click', () => this.saveToFile());
    const fileInput = document.getElementById('load-file-input') as HTMLInputElement;
    document.getElementById('load-game')!.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const save = JSON.parse(event.target?.result as string);
          this.restoreFromSave(save);
          this.saveGame();
        } catch (err) {
          alert('Не удалось загрузить файл: ' + (err as Error).message);
        }
        fileInput.value = '';
      };
      reader.readAsText(files[0]);
    });
    document.querySelectorAll('input[name="mode"]').forEach(el => {
      el.addEventListener('change', (e) => {
        const newMode = (e.target as HTMLInputElement).value as 'pvp' | 'ai';
        this.mode = newMode;
        this.saveSettings();
        if (this.mode === 'ai' && !isGameOver(this.state) && this.state.turn !== this.playerColor) {
          this.makeAIMove();
        }
      });
    });
    document.getElementById('ai-color')!.addEventListener('change', (e) => {
      const select = e.target as HTMLSelectElement;
      const newColor = select.value as Color;
      const oldColor = this.playerColor;
      this.confirmRestart(
        () => {
          this.playerColor = newColor;
          this.saveSettings();
          this.clearGameSave();
          this.newGame();
        },
        () => {
          select.value = oldColor;
        }
      );
    });
    document.getElementById('flip-board')!.addEventListener('change', (e) => {
      this.flipBoard = (e.target as HTMLInputElement).checked;
      this.saveSettings();
      this.render();
    });
    document.getElementById('game-select')!.addEventListener('change', (e) => {
      const select = e.target as HTMLSelectElement;
      const newUrl = select.value;
      const oldUrl = this.currentConfigUrl;
      this.confirmRestart(
        () => {
          this.currentConfigUrl = newUrl;
          this.currentLevelIndex = 0;
          this.saveSettings();
          this.clearGameSave();
          this.populateLevelSelect();
          this.newGame();
        },
        () => {
          select.value = oldUrl;
        }
      );
    });
    document.getElementById('level-select')!.addEventListener('change', (e) => {
      const index = parseInt((e.target as HTMLSelectElement).value, 10);
      this.selectLevel(index);
    });
    document.getElementById('skin-select')!.addEventListener('change', (e) => {
      this.applySkin((e.target as HTMLSelectElement).value);
      this.saveSettings();
    });

    window.addEventListener('beforeunload', () => {
      this.saveGame();
    });

    // Confirm restart modal
    const confirmModal = document.createElement('div');
    confirmModal.id = 'confirm-modal';
    confirmModal.innerHTML = `
      <div class="confirm-overlay">
        <div class="confirm-dialog">
          <p>Изменения перезапустят игру. Продолжить?</p>
          <div class="confirm-buttons">
            <button id="confirm-yes" class="confirm-btn-yes">Да</button>
            <button id="confirm-no" class="confirm-btn-no">Нет</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(confirmModal);

    // Promotion modal
    const modal = document.createElement('div');
    modal.id = 'promotion-modal';
    modal.innerHTML = `<div class="promotion-options"></div>`;
    document.body.appendChild(modal);

    modal.querySelector('.promotion-options')!.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.promotion-option') as HTMLElement | null;
      if (target) {
        const piece = target.dataset.piece as PieceType;
        this.completePromotion(piece);
      }
    });
  }

  private async newGame(): Promise<void> {
    this.stopMoveTimer();
    this.stopGameTimer();
    this.selectedSquare = null;
    this.validMoves = [];
    this.lastMove = null;
    this.aiThinking = false;
    this.promotionPending = null;
    this.multiCaptureActive = false;
    this.multiCapturePos = null;
    this.moveHistory = [];
    this.stateHistory = [];
    this.gameStartTime = Date.now();
    this.moveStartTime = this.gameStartTime;
    this.whiteTotalTime = 0;
    this.blackTotalTime = 0;
    this.whiteMoveCount = 0;
    this.blackMoveCount = 0;
    this.whiteCaptures = 0;
    this.blackCaptures = 0;
    this.whiteScore = 0;
    this.blackScore = 0;
    this.captureHistory = [];
    this.levelCompletedThisSession = false;
    this.renderHistory();
    document.getElementById('promotion-modal')!.classList.remove('active');

    const config = this.gameConfigs.get(this.currentConfigUrl);
    if (config) {
      setPieceConfig(config.pieces);
      const boardConfig = this.getLevelBoardConfig();
      this.state = createInitialState(boardConfig);
      this.state.victoryCondition = config.victoryCondition;
      this.state.forcedCapture = config.forcedCapture ?? false;
      this.state.moveTimeLimit = config.moveTimeLimit ?? 0;
      this.state.gameTimeLimit = config.gameTimeLimit ?? 0;
      this.state.moveCountLimit = config.moveCountLimit ?? 0;
    } else {
      this.state = createInitialState();
    }

    this.render();
    this.startMoveTimer();
    this.startGameTimer();
  }

  private render(): void {
    const boardEl = document.getElementById('board')!;

    // FLIP animation: only when there are existing pieces and a last move
    const hasPieces = boardEl.querySelectorAll('.piece').length > 0;
    const firstRects = new Map<string, DOMRect>();
    if (hasPieces && this.lastMove) {
      boardEl.querySelectorAll('.piece').forEach(el => {
        const id = (el as HTMLElement).dataset.pieceId;
        if (id) firstRects.set(id, el.getBoundingClientRect());
      });
    }

    this.performRender(boardEl);

    if (hasPieces && this.lastMove) {
      boardEl.querySelectorAll('.piece').forEach(el => {
        const pieceEl = el as HTMLElement;
        const id = pieceEl.dataset.pieceId;
        if (id && firstRects.has(id)) {
          const first = firstRects.get(id)!;
          const last = pieceEl.getBoundingClientRect();
          const dx = first.left - last.left;
          const dy = first.top - last.top;
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            pieceEl.style.transition = 'none';
            pieceEl.style.transform = `translate(${dx}px, ${dy}px)`;
            pieceEl.offsetHeight; // force reflow
            pieceEl.style.transition = 'transform 0.25s ease';
            pieceEl.style.transform = '';
          }
        }
      });
    }
  }

  private performRender(boardEl: HTMLElement): void {
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${this.state.width}, var(--square-size))`;
    boardEl.style.gridTemplateRows = `repeat(${this.state.height}, var(--square-size))`;

    const wrapper = document.querySelector('.board-wrapper') as HTMLElement;
    if (wrapper) {
      wrapper.classList.toggle('flipped', this.flipBoard);
    }

    const boardBg = document.querySelector('.board-bg') as HTMLElement;
    if (boardBg) {
      boardBg.style.width = `calc(var(--square-size) * ${this.state.width} + var(--board-label-left) + var(--board-label-right))`;
      boardBg.style.height = `calc(var(--square-size) * ${this.state.height} + var(--board-label-top) + var(--board-label-bottom))`;
    }

    const rows = this.flipBoard
      ? Array.from({ length: this.state.height }, (_, i) => this.state.height - 1 - i)
      : Array.from({ length: this.state.height }, (_, i) => i);
    const cols = Array.from({ length: this.state.width }, (_, i) => i);

    const kingInCheck = isInCheck(this.state, this.state.turn);
    const kingPos = kingInCheck ? findKing(this.state, this.state.turn) : null;

    for (const row of rows) {
      for (const col of cols) {
        const square = document.createElement('div');
        const sqType = this.state.squares[row][col];
        const isLight = (row + col) % 2 === 0;
        square.className = `square ${sqType === 'wall' ? 'wall' : (isLight ? 'light' : 'dark')}`;
        square.dataset.row = String(row);
        square.dataset.col = String(col);

        const piece = getPiece(this.state, { row, col });
        if (piece) {
          const pieceEl = document.createElement('div');
          pieceEl.className = 'piece';
          pieceEl.dataset.pieceId = String(piece.id);
          const img = document.createElement('img');
          img.src = getPiecePaths()[piece.color][piece.type];
          img.alt = `${piece.color} ${piece.type}`;

          // Mirror pieces based on board position
          const typeConfig = getPieceConfig().pieceTypes[piece.type];
          const mirrorH = typeConfig?.mirrorH ?? false;
          const mirrorV = typeConfig?.mirrorV ?? false;
          if (mirrorH || mirrorV) {
            const scaleX = mirrorH && col >= this.state.width / 2 ? -1 : 1;
            const scaleY = mirrorV && row >= this.state.height / 2 ? -1 : 1;
            if (scaleX !== 1 || scaleY !== 1) {
              img.style.transform = `scaleX(${scaleX}) scaleY(${scaleY})`;
            }
          }

          pieceEl.appendChild(img);
          square.appendChild(pieceEl);
        }

        // Highlight visited squares
        if (this.state.visitedSquares[row][col]) {
          square.classList.add('visited');
        }

        // Highlight last move
        if (this.lastMove) {
          if ((this.lastMove.from.row === row && this.lastMove.from.col === col) ||
              (this.lastMove.to.row === row && this.lastMove.to.col === col)) {
            square.classList.add('last-move');
          }
        }

        // Highlight selected
        if (this.selectedSquare && this.selectedSquare.row === row && this.selectedSquare.col === col) {
          square.classList.add('selected');
        }

        // Highlight check
        if (kingPos && kingPos.row === row && kingPos.col === col) {
          square.classList.add('check');
        }

        // Highlight valid moves
        const isValidMove = this.validMoves.some(m => m.to.row === row && m.to.col === col);
        if (isValidMove) {
          if (piece) {
            square.classList.add('valid-capture');
          } else {
            square.classList.add('valid-move');
          }
        }

        if (sqType !== 'wall') {
          square.addEventListener('click', () => this.onSquareClick(row, col));
        }
        boardEl.appendChild(square);
      }
    }

    this.updateStatus();
  }

  private updateStatus(): void {
    const statusEl = document.getElementById('status')!;
    const levelName = this.getCurrentLevelName();
    const baseStatus = getGameStatus(this.state);
    statusEl.textContent = levelName ? `${levelName} — ${baseStatus}` : baseStatus;
    this.updateMoveCounterDisplay();

    if (isGameOver(this.state)) {
      this.aiThinking = true;
      if (!this.levelCompletedThisSession) {
        const victory = isVictory(this.state);
        if (victory) {
          this.levelCompletedThisSession = true;
          this.completeCurrentLevel();
          // Auto-advance to next level if available
          const config = this.gameConfigs.get(this.currentConfigUrl);
          if (config?.levels && this.currentLevelIndex + 1 < config.levels.length) {
            this.currentLevelIndex++;
            this.saveSettings();
            this.saveGame();
            this.populateLevelSelect();
            const nextName = config.levels[this.currentLevelIndex].name;
            statusEl.textContent = `Победа! Следующий уровень: ${nextName}. Нажмите «Новая игра»`;
            return;
          }
          this.populateLevelSelect();
        }
      }
    }
  }

  private onSquareClick(row: number, col: number): void {
    if (this.aiThinking || this.promotionPending) return;
    if (this.mode === 'ai' && this.state.turn !== this.playerColor) return;
    if (isGameOver(this.state)) return;

    const pos = { row, col };
    const piece = getPiece(this.state, pos);

    // During multi-capture, only allow clicking the active piece or its valid move targets
    if (this.multiCaptureActive) {
      const matchingMove = this.validMoves.find(m => m.to.row === row && m.to.col === col);
      if (matchingMove && this.selectedSquare) {
        this.executeMove({ from: this.selectedSquare, to: pos, promotion: matchingMove.promotion });
        return;
      }
      if (this.multiCapturePos && this.multiCapturePos.row === row && this.multiCapturePos.col === col) {
        this.selectedSquare = pos;
        this.render();
        return;
      }
      return;
    }

    // If clicking a valid move target, make the move
    const matchingMove = this.validMoves.find(m => m.to.row === row && m.to.col === col);
    if (matchingMove && this.selectedSquare) {
      const movingPiece = getPiece(this.state, this.selectedSquare);
      if (!movingPiece) return;
      const typeConfig = getPieceConfig().pieceTypes[movingPiece.type];
      if (typeConfig?.special?.includes('promotion') && (row === 0 || row === this.state.height - 1)) {
        if (typeConfig?.promotionTarget) {
          this.executeMove({ from: this.selectedSquare, to: pos, promotion: typeConfig.promotionTarget });
          return;
        }
        // Chess pawn — show promotion modal
        this.promotionPending = { from: this.selectedSquare, to: pos, color: movingPiece.color };
        this.showPromotionModal(movingPiece.color);
        document.getElementById('promotion-modal')!.classList.add('active');
        return;
      }
      this.executeMove({ from: this.selectedSquare, to: pos, promotion: matchingMove.promotion });
      return;
    }

    // If clicking own piece, select it
    if (piece && piece.color === this.state.turn) {
      this.selectedSquare = pos;
      this.validMoves = getLegalMoves(this.state, pos);
      // Forced capture: if any capture is available globally, only captures are allowed
      if (this.state.forcedCapture) {
        const allMoves = getAllLegalMoves(this.state, this.state.turn);
        const captures = allMoves.filter(m => m.isCapture);
        if (captures.length > 0) {
          this.validMoves = this.validMoves.filter(m => m.isCapture);
        }
      }
      this.render();
    } else {
      this.selectedSquare = null;
      this.validMoves = [];
      this.render();
    }
  }

  private completePromotion(pieceType: PieceType): void {
    if (!this.promotionPending) return;
    document.getElementById('promotion-modal')!.classList.remove('active');
    const { from, to } = this.promotionPending;
    this.promotionPending = null;
    this.executeMove({ from, to, promotion: pieceType });
  }

  private showPromotionModal(color: Color): void {
    const options = document.querySelector('#promotion-modal .promotion-options')!;
    options.innerHTML = '';
    const paths = getPiecePaths()[color];
    const pieces: PieceType[] = ['queen', 'rook', 'bishop', 'knight'];
    for (const type of pieces) {
      const div = document.createElement('div');
      div.className = 'promotion-option';
      div.dataset.piece = type;
      const img = document.createElement('img');
      img.src = paths[type];
      img.alt = `${color} ${type}`;
      div.appendChild(img);
      options.appendChild(div);
    }
  }

  private executeMove(move: Move): void {
    this.stopMoveTimer();
    const prevState = cloneState(this.state);

    const result = makeMove(this.state, move);
    if (!result) return;

    this.stateHistory.push(prevState);

    // Track captures and score
    if (result.captured) {
      const value = getPieceValue(result.captured.type);
      if (this.state.turn === 'black') {
        this.whiteCaptures++;
        this.whiteScore += value;
      } else {
        this.blackCaptures++;
        this.blackScore += value;
      }
    }
    this.captureHistory.push({
      whiteCaptures: this.whiteCaptures,
      blackCaptures: this.blackCaptures,
      whiteScore: this.whiteScore,
      blackScore: this.blackScore,
    });

    const moveTime = Date.now() - this.moveStartTime;
    this.moveStartTime = Date.now();

    // Multi-capture logic
    const piece = getPiece(this.state, move.to);
    if (result.wasJumpCapture && piece) {
      const config = getPieceConfig();
      const typeConfig = config.pieceTypes[piece.type];
      const hasMultiCapture = typeConfig?.behaviors.some((b: { conditions?: string[] }) => b.conditions?.includes('multiCapture')) ?? false;
      if (hasMultiCapture) {
        let nextMoves = getLegalMoves(this.state, move.to);
        // Filter to only captures for multi-capture continuation
        nextMoves = nextMoves.filter(m => m.isCapture);
        // Apply forced capture filter
        if (this.state.forcedCapture) {
          const allMoves = getAllLegalMoves(this.state, this.state.turn);
          const captures = allMoves.filter(m => m.isCapture);
          if (captures.length > 0) {
            nextMoves = nextMoves.filter(m => m.isCapture);
          }
        }
        if (nextMoves.length > 0) {
          // Revert turn change — same player continues
          this.state.turn = this.state.turn === 'white' ? 'black' : 'white';
          this.multiCaptureActive = true;
          this.multiCapturePos = move.to;
          this.selectedSquare = move.to;
          this.validMoves = nextMoves;
          this.lastMove = move;
          this.render();
          this.startMoveTimer();
          this.saveGame();
          return;
        }
      }
    }

    this.lastMove = move;
    this.selectedSquare = null;
    this.validMoves = [];
    this.multiCaptureActive = false;
    this.multiCapturePos = null;
    this.addMoveToHistory(result, moveTime);
    this.render();
    if (!isGameOver(this.state)) {
      this.startMoveTimer();
    }

    if (this.mode === 'ai' && !isGameOver(this.state) && this.state.turn !== this.playerColor) {
      setTimeout(() => this.makeAIMove(), 300);
    }
    this.saveGame();
  }

  private makeAIMove(): void {
    this.aiThinking = true;
    setTimeout(() => {
      try {
        const move = findBestMove(this.state, 3);
        if (move) {
          const prevState = cloneState(this.state);
          const result = makeMove(this.state, move);
          if (result) {
            this.stateHistory.push(prevState);
            const moveTime = Date.now() - this.moveStartTime;
            this.moveStartTime = Date.now();
            this.lastMove = move;
            this.addMoveToHistory(result, moveTime);
            this.render();
            if (!isGameOver(this.state)) {
              this.startMoveTimer();
            }
            this.saveGame();
          }
        }
      } catch (e) {
        console.error('AI move failed:', e);
      }
      this.aiThinking = false;
    }, 50);
  }

  private undoMove(): void {
    if (this.stateHistory.length === 0) return;
    if (this.aiThinking) return;
    this.stopMoveTimer();
    this.stopGameTimer();

    const undoCount = (this.mode === 'ai' && this.stateHistory.length >= 2) ? 2 : 1;
    for (let i = 0; i < undoCount && this.stateHistory.length > 0; i++) {
      this.state = cloneState(this.stateHistory.pop()!);
      if (this.captureHistory.length > 0) {
        this.captureHistory.pop();
      }
    }

    if (this.captureHistory.length > 0) {
      const last = this.captureHistory[this.captureHistory.length - 1];
      this.whiteCaptures = last.whiteCaptures;
      this.blackCaptures = last.blackCaptures;
      this.whiteScore = last.whiteScore;
      this.blackScore = last.blackScore;
    } else {
      this.whiteCaptures = 0;
      this.blackCaptures = 0;
      this.whiteScore = 0;
      this.blackScore = 0;
    }

    this.selectedSquare = null;
    this.validMoves = [];
    this.lastMove = null;
    this.multiCaptureActive = false;
    this.multiCapturePos = null;
    this.moveStartTime = Date.now();

    this.moveHistory.push({ undo: true });
    this.renderHistory();
    this.render();
    if (!isGameOver(this.state)) {
      this.startMoveTimer();
      this.startGameTimer();
    }
    this.saveGame();
  }

  private formatMove(result: MoveResult): string {
    if (result.wasCastling) {
      return result.move.to.col > result.move.from.col ? 'O-O' : 'O-O-O';
    }

    let notation = posToString(result.move.from) + '-' + posToString(result.move.to);
    if (result.captured) {
      notation = posToString(result.move.from) + 'x' + posToString(result.move.to);
    }
    if (result.promotion) {
      notation += '=' + result.promotion.charAt(0).toUpperCase();
    }
    if (isVictory(this.state)) {
      notation += '#';
    } else if (isInCheck(this.state, this.state.turn)) {
      notation += '+';
    }
    return notation;
  }

  private addMoveToHistory(result: MoveResult, moveTime: number): void {
    const notation = this.formatMove(result);
    const timeStr = this.formatTime(moveTime);
    const victory = isVictory(this.state);
    const checkNote = isInCheck(this.state, this.state.turn) && !victory ? 'Шах!' : undefined;
    const mateNote = victory ? 'Мат!' : undefined;
    // turn was already swapped by makeMove
    if (this.state.turn === 'black') {
      // White just moved
      this.whiteTotalTime += moveTime;
      this.whiteMoveCount++;
      this.moveHistory.push({ white: notation, whiteTime: timeStr, check: checkNote, mate: mateNote });
    } else {
      // Black just moved
      this.blackTotalTime += moveTime;
      this.blackMoveCount++;
      const last = this.moveHistory[this.moveHistory.length - 1];
      if (last) {
        last.black = notation;
        last.blackTime = timeStr;
        last.check = checkNote;
        last.mate = mateNote;
      } else {
        this.moveHistory.push({ black: notation, blackTime: timeStr, check: checkNote, mate: mateNote });
      }
    }
    this.renderHistory();
  }

  private formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  }

  private renderHistory(): void {
    const container = document.getElementById('move-history')!;
    container.innerHTML = '';
    let moveIndex = 1;
    this.moveHistory.forEach((entry) => {
      if (entry.undo) {
        const row = document.createElement('div');
        row.className = 'history-row';
        row.innerHTML = `<span class="history-number">↩</span><span style="color:#e74c3c">Отмена хода</span>`;
        container.appendChild(row);
        return;
      }
      const row = document.createElement('div');
      row.className = 'history-row';
      const checkHtml = entry.check ? `<span class="history-check">${entry.check}</span>` : '';
      const mateHtml = entry.mate ? `<span class="history-mate">${entry.mate}</span>` : '';
      row.innerHTML = `
        <span class="history-number">${moveIndex}.</span>
        <span class="history-white">${entry.white ?? ''}<span class="history-time">${entry.whiteTime ?? ''}</span></span>
        <span class="history-black">${entry.black ?? ''}<span class="history-time">${entry.blackTime ?? ''}</span></span>
        ${checkHtml}
        ${mateHtml}
      `;
      container.appendChild(row);
      moveIndex++;
    });

    // Stats
    const totalTime = Date.now() - this.gameStartTime;
    document.getElementById('total-time')!.textContent = this.formatTime(totalTime);
    document.getElementById('white-time')!.textContent = this.formatTime(this.whiteTotalTime);
    document.getElementById('black-time')!.textContent = this.formatTime(this.blackTotalTime);
    document.getElementById('white-avg')!.textContent = this.whiteMoveCount > 0
      ? this.formatTime(Math.round(this.whiteTotalTime / this.whiteMoveCount))
      : '—';
    document.getElementById('black-avg')!.textContent = this.blackMoveCount > 0
      ? this.formatTime(Math.round(this.blackTotalTime / this.blackMoveCount))
      : '—';
    document.getElementById('white-captures')!.textContent = `${this.whiteCaptures} фиг. (${this.whiteScore} очк.)`;
    document.getElementById('black-captures')!.textContent = `${this.blackCaptures} фиг. (${this.blackScore} очк.)`;
  }
}

new ChessGame();
