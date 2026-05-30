const API_URL = 'tg3-production.up.railway.app';

// ======================================================
// MOCK MODE — поменяй на true чтобы работать без сервера
// ======================================================
export const USE_MOCK = false;

const mockDelay = () => new Promise(res => setTimeout(res, 400));

function getMockDB(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem('mock_users') || '{}'); }
  catch { return {}; }
}
function saveMockDB(db: Record<string, any>) {
  localStorage.setItem('mock_users', JSON.stringify(db));
}
function getMockChats(): any[] {
  try { return JSON.parse(localStorage.getItem('mock_chats') || '[]'); }
  catch { return []; }
}
function saveMockChats(chats: any[]) {
  localStorage.setItem('mock_chats', JSON.stringify(chats));
}
function getMockMessages(chatId: string): any[] {
  try { return JSON.parse(localStorage.getItem(`mock_msgs_${chatId}`) || '[]'); }
  catch { return []; }
}
function saveMockMessages(chatId: string, msgs: any[]) {
  localStorage.setItem(`mock_msgs_${chatId}`, JSON.stringify(msgs));
}

async function mockRequest(endpoint: string, method: string, data?: any): Promise<any> {
  await mockDelay();

  // Регистрация
  if (endpoint === '/auth/register' && method === 'POST') {
    const { username, email, password, displayName } = data;
    const db = getMockDB();
    const clean = username.replace('@', '').toLowerCase();
    if (db[clean]) throw new Error('Пользователь с таким именем уже существует');
    const user = { id: Date.now(), username: clean, email, displayName, avatar: null, bio: '' };
    db[clean] = { ...user, password };
    saveMockDB(db);
    localStorage.setItem('mock_token_user', clean);
    return { token: `mock-token-${clean}`, user };
  }

  // Вход
  if (endpoint === '/auth/login' && method === 'POST') {
    const { username, password } = data;
    const db = getMockDB();
    const clean = username.replace('@', '').toLowerCase();
    const found = db[clean];
    if (!found || found.password !== password) throw new Error('Неверное имя пользователя или пароль');
    localStorage.setItem('mock_token_user', clean);
    const { password: _, ...user } = found;
    return { token: `mock-token-${clean}`, user };
  }

  // Текущий пользователь
  if (endpoint === '/auth/me' && method === 'GET') {
    const u = localStorage.getItem('mock_token_user');
    if (!u) throw new Error('Не авторизован');
    const db = getMockDB();
    const found = db[u];
    if (!found) throw new Error('Пользователь не найден');
    const { password: _, ...user } = found;
    return user;
  }

  // Обновить профиль
  if (endpoint === '/users/me' && method === 'PUT') {
    const u = localStorage.getItem('mock_token_user');
    if (!u) throw new Error('Не авторизован');
    const db = getMockDB();
    db[u] = { ...db[u], ...data };
    saveMockDB(db);
    const { password: _, ...user } = db[u];
    return user;
  }

  // Поиск пользователей
  if (endpoint === '/search' && method === 'GET') {
    return [];
  }
  if (endpoint.startsWith('/search?') && method === 'GET') {
    return [];
  }
  if (endpoint.startsWith('/users/search') && method === 'GET') {
    return [];
  }

  // Чаты
  if (endpoint === '/chats' && method === 'GET') {
    return getMockChats();
  }
  if (endpoint === '/chats' && method === 'POST') {
    const chats = getMockChats();
    const newChat = { id: `chat_${Date.now()}`, type: 'chat', name: data.userId || 'Чат', lastMessage: null, unreadCount: 0 };
    chats.unshift(newChat);
    saveMockChats(chats);
    return newChat;
  }

  // Сообщения
  if (endpoint.match(/^\/chats\/[^/]+\/messages$/) && method === 'GET') {
    const chatId = endpoint.split('/')[2];
    return getMockMessages(chatId);
  }
  if (endpoint.match(/^\/chats\/[^/]+\/messages$/) && method === 'POST') {
    const chatId = endpoint.split('/')[2];
    const msgs = getMockMessages(chatId);
    const msg = { id: Date.now(), chatId, content: data.content, createdAt: new Date().toISOString(), sender: { username: localStorage.getItem('mock_token_user') } };
    msgs.push(msg);
    saveMockMessages(chatId, msgs);
    // Обновить lastMessage в чате
    const chats = getMockChats();
    const ci = chats.findIndex((c: any) => c.id === chatId);
    if (ci !== -1) { chats[ci].lastMessage = msg; saveMockChats(chats); }
    return msg;
  }

  // Каналы
  if (endpoint === '/channels' && method === 'POST') {
    const chats = getMockChats();
    const ch = { id: `ch_${Date.now()}`, type: 'channel', name: data.name, description: data.description, lastMessage: null, unreadCount: 0 };
    chats.unshift(ch);
    saveMockChats(chats);
    return ch;
  }

  console.warn(`Mock: нет обработчика для ${method} ${endpoint}`);
  return Array.isArray(data) ? [] : {};
}

export class ApiService {
  private static token: string | null = null;

  static setToken(token: string | null) { this.token = token; }

  static async request(endpoint: string, options: RequestInit = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.headers) Object.assign(headers, options.headers);
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Network error' }));
      throw new Error(error.message || 'Request failed');
    }
    return response.json();
  }

  static async get(endpoint: string) {
    if (USE_MOCK) return mockRequest(endpoint, 'GET');
    return this.request(endpoint, { method: 'GET' });
  }

  static async post(endpoint: string, data: any) {
    if (USE_MOCK) return mockRequest(endpoint, 'POST', data);
    return this.request(endpoint, { method: 'POST', body: JSON.stringify(data) });
  }

  static async put(endpoint: string, data: any) {
    if (USE_MOCK) return mockRequest(endpoint, 'PUT', data);
    return this.request(endpoint, { method: 'PUT', body: JSON.stringify(data) });
  }

  static async delete(endpoint: string) {
    if (USE_MOCK) return mockRequest(endpoint, 'DELETE');
    return this.request(endpoint, { method: 'DELETE' });
  }

  // uploadFile в mock-режиме читает файл как base64 и сохраняет локально
  static async uploadFile(endpoint: string, file: File, onProgress?: (progress: number) => void): Promise<any> {
    if (USE_MOCK) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (onProgress) onProgress(100);
          resolve({ url: reader.result as string });
        };
        reader.readAsDataURL(file);
      });
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) onProgress((e.loaded / e.total) * 100);
      });
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
        else reject(new Error('Upload failed'));
      });
      xhr.addEventListener('error', () => reject(new Error('Upload failed')));
      xhr.open('POST', `${API_URL}${endpoint}`);
      if (this.token) xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
      xhr.send(formData);
    });
  }
}
