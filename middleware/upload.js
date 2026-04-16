const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

function makeStorage(dest) {
  return multer.diskStorage({
    destination: path.join(__dirname, '..', 'data', dest),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, crypto.randomBytes(16).toString('hex') + ext);
    }
  });
}

const photoFilter = (req, file, cb) => {
  cb(null, /image\/(jpeg|png|gif|webp)/.test(file.mimetype));
};

const docFilter = (req, file, cb) => {
  cb(null, /image\/(jpeg|png)|application\/pdf/.test(file.mimetype));
};

module.exports = {
  photo: multer({ storage: makeStorage('photos'), fileFilter: photoFilter, limits: { fileSize: 20 * 1024 * 1024 } }),
  document: multer({ storage: makeStorage('documents'), fileFilter: docFilter, limits: { fileSize: 20 * 1024 * 1024 } }),
  receipt: multer({ storage: makeStorage('receipts'), fileFilter: photoFilter, limits: { fileSize: 10 * 1024 * 1024 } })
};
