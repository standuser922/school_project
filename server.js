const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const CHAT_FILE = 'chat-history.json';
const UPLOAD_DIR = 'uploads';

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, 
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-msdownload',        
    'application/x-msdos-program',     
    'application/octet-stream',       
    'audio/mpeg', 'audio/wav', 'audio/ogg',
    'video/mp4', 'video/webm'
];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Неподдерживаемый тип файла'));
        }
    }
});

app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(__dirname)); 
function loadChatHistory() {
    try {
        const data = fs.readFileSync(CHAT_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
        return [];
    }
}

function saveMessage(message) {
    try {
        const history = loadChatHistory();
        history.push(message);
        
        const limitedHistory = history.slice(-1000);
        
        fs.writeFileSync(CHAT_FILE, JSON.stringify(limitedHistory, null, 2));
    } catch (error) {
        console.error('Ошибка сохранения сообщения:', error);
    }
}

function getFileIcon(filename) {
    const ext = path.extname(filename).toLowerCase();
    const iconMap = {
        '.jpg': '🖼️',
        '.jpeg': '🖼️',
        '.png': '🖼️',
        '.gif': '🖼️',
        '.webp': '🖼️',
        '.pdf': '📄',
        '.doc': '📝',
        '.docx': '📝',
        '.txt': '📃',
        '.zip': '📦',
        '.rar': '📦',
        '.7z': '📦'
    };
    
    return iconMap[ext] || '📎';
}

function getFileType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const imageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const documentTypes = ['.pdf', '.doc', '.docx', '.txt'];
    const archiveTypes = ['.zip', '.rar', '.7z'];
    
    if (imageTypes.includes(ext)) return 'image';
    if (documentTypes.includes(ext)) return 'document';
    if (archiveTypes.includes(ext)) return 'archive';
    return 'other';
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/history', (req, res) => {
    res.json(loadChatHistory());
});

app.post('/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }
        
        const fileUrl = `/uploads/${req.file.filename}`;
        const fileInfo = {
            originalName: req.file.originalname,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype,
            url: fileUrl,
            type: getFileType(req.file.originalname),
            icon: getFileIcon(req.file.originalname)
        };
        
        res.json(fileInfo);
    } catch (error) {
        console.error('Ошибка загрузки файла:', error);
        res.status(500).json({ error: 'Ошибка загрузки файла' });
    }
});

app.post('/upload-base64', express.json({ limit: '10mb' }), async (req, res) => {
    try {
        const { filename, data, type } = req.body;
        
        if (!filename || !data) {
            return res.status(400).json({ error: 'Отсутствуют данные файла' });
        }
        
        const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        const fileExt = type === 'image/png' ? '.png' : 
                       type === 'image/jpeg' ? '.jpg' :
                       path.extname(filename);
        const uniqueName = `${Date.now()}-${uuidv4()}${fileExt}`;
        const filePath = path.join(UPLOAD_DIR, uniqueName);
       
        await fs.promises.writeFile(filePath, buffer);
        
        const fileUrl = `/uploads/${uniqueName}`;
        const fileInfo = {
            originalName: filename,
            filename: uniqueName,
            size: buffer.length,
            mimetype: type,
            url: fileUrl,
            type: getFileType(uniqueName),
            icon: getFileIcon(uniqueName)
        };
        
        res.json(fileInfo);
    } catch (error) {
        console.error('Ошибка загрузки base64:', error);
        res.status(500).json({ error: 'Ошибка загрузки файла' });
    }
});

app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Файл слишком большой (максимум 10MB)' });
        }
        return res.status(400).json({ error: error.message });
    }
    
    if (error) {
        return res.status(400).json({ error: error.message });
    }
    
    next();
});

io.on('connection', (socket) => {
    console.log('Новый пользователь подключился:', socket.id);

    socket.emit('chat history', loadChatHistory());

    socket.on('set username', (username) => {
        socket.username = username || `Гость_${socket.id.substring(0, 5)}`;
        socket.emit('username set', socket.username);
        
        const systemMessage = {
            id: Date.now(),
            username: 'Система',
            message: `${socket.username} присоединился к чату`,
            timestamp: new Date().toISOString(),
            type: 'system'
        };
        
        saveMessage(systemMessage);
        io.emit('chat message', systemMessage);
    });

    socket.on('chat message', (msg) => {
        const messageData = {
            id: Date.now(),
            username: socket.username || `Гость_${socket.id.substring(0, 5)}`,
            message: msg,
            timestamp: new Date().toISOString(),
            socketId: socket.id,
            type: 'user'
        };

        saveMessage(messageData);
        io.emit('chat message', messageData);
    });

    socket.on('file message', (fileData) => {
        const messageData = {
            id: Date.now(),
            username: socket.username || `Гость_${socket.id.substring(0, 5)}`,
            message: fileData.message || '',
            file: fileData.file,
            timestamp: new Date().toISOString(),
            socketId: socket.id,
            type: 'file'
        };

        saveMessage(messageData);
        io.emit('chat message', messageData);
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            const systemMessage = {
                id: Date.now(),
                username: 'Система',
                message: `${socket.username} покинул чат`,
                timestamp: new Date().toISOString(),
                type: 'system'
            };
            
            saveMessage(systemMessage);
            io.emit('chat message', systemMessage);
        }
        console.log('Пользователь отключился:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Сервер чата запущен на http://localhost:${PORT}`);
    console.log(`Загрузки сохраняются в папке: ${UPLOAD_DIR}`);
    console.log(`Максимальный размер файла: 10MB`);
});
