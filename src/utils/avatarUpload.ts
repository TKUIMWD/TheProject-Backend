import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../middlewares/log';

// 允許的圖片類型
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOAD_DIR = path.join(__dirname, '../../uploads/avatars');
const DEFAULT_AVATAR = '/uploads/avatars/default-avatar.jpg';

// 確保上傳目錄存在
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 檢查文件是否為真實圖片（檢查文件頭）
const isValidImageFile = async (buffer: Buffer): Promise<boolean> => {
    try {
        const metadata = await sharp(buffer).metadata();
        return !!(metadata.width && metadata.height && metadata.format);
    } catch (error) {
        return false;
    }
};

// 檢查文件名安全性
const isValidFilename = (filename: string): boolean => {
    // 檢查是否包含危險字符
    const dangerousChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (dangerousChars.test(filename)) {
        return false;
    }
    
    // 檢查文件名長度
    if (filename.length > 255) {
        return false;
    }
    
    // 檢查是否為保留名稱（Windows）
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    const nameWithoutExt = path.parse(filename).name;
    if (reservedNames.test(nameWithoutExt)) {
        return false;
    }
    
    return true;
};

// Multer 配置
const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    try {
        // 檢查 MIME 類型
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            logger.warn(`Invalid file type attempted: ${file.mimetype}`);
            return cb(new Error('只允許上傳 JPEG、PNG 或 WebP 格式的圖片'));
        }
        
        // 檢查文件副檔名
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            logger.warn(`Invalid file extension attempted: ${ext}`);
            return cb(new Error('不允許的文件副檔名'));
        }
        
        // 檢查文件名安全性
        if (!isValidFilename(file.originalname)) {
            logger.warn(`Invalid filename attempted: ${file.originalname}`);
            return cb(new Error('文件名包含不安全的字符'));
        }
        
        cb(null, true);
    } catch (error) {
        logger.error(`File filter error: ${error}`);
        cb(new Error('文件驗證失敗'));
    }
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1,
    },
});

// 處理頭像上傳和處理
export const processAvatar = async (file: Express.Multer.File): Promise<string> => {
    try {
        // 雙重檢查：驗證文件內容是否真的是圖片
        const isValidImage = await isValidImageFile(file.buffer);
        if (!isValidImage) {
            throw new Error('文件內容不是有效的圖片格式');
        }
        
        // 生成隨機文件名
        const randomFilename = `${uuidv4()}.jpg`;
        const outputPath = path.join(UPLOAD_DIR, randomFilename);
        
        // 使用 Sharp 處理圖片：調整大小為 1024x1024，轉為 JPEG 格式
        await sharp(file.buffer)
            .resize(1024, 1024, {
                fit: 'cover',
                position: 'center'
            })
            .jpeg({
                quality: 90,
                progressive: true
            })
            .toFile(outputPath);
        
        // 返回相對路徑，用於數據庫存儲和前端訪問
        const relativePath = `/uploads/avatars/${randomFilename}`;
        logger.info(`Avatar processed and saved: ${relativePath}`);
        
        return relativePath;
    } catch (error) {
        logger.error(`Error processing avatar: ${error}`);
        throw error;
    }
};

// 刪除頭像文件
export const deleteAvatar = (avatarPath: string): void => {
    try {
        if (avatarPath && avatarPath !== DEFAULT_AVATAR) {
            // 移除路徑前的斜線，構建完整路徑
            const filename = avatarPath.replace('/uploads/avatars/', '');
            const fullPath = path.join(UPLOAD_DIR, filename);
            
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
                logger.info(`Avatar deleted: ${avatarPath}`);
            }
        }
    } catch (error) {
        logger.error(`Error deleting avatar: ${error}`);
    }
};

// 錯誤處理中間件
export const handleMulterError = (error: any, req: Request, res: Response, next: NextFunction) => {
    if (error instanceof multer.MulterError) {
        switch (error.code) {
            case 'LIMIT_FILE_SIZE':
                return res.status(400).json({
                    code: 400,
                    message: '文件大小超過限制（最大 5MB）'
                });
            case 'LIMIT_FILE_COUNT':
                return res.status(400).json({
                    code: 400,
                    message: '只能上傳一個文件'
                });
            case 'LIMIT_UNEXPECTED_FILE':
                return res.status(400).json({
                    code: 400,
                    message: '意外的文件字段'
                });
            default:
                return res.status(400).json({
                    code: 400,
                    message: '文件上傳錯誤'
                });
        }
    }
    
    if (error.message) {
        return res.status(400).json({
            code: 400,
            message: error.message
        });
    }
    
    next(error);
};

export { DEFAULT_AVATAR };
