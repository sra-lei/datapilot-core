
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

async function assignAdminRole() {
  return new Promise((resolve, reject) => {
    // 查找 Sra 用户
    db.get('SELECT id FROM users WHERE username = ?', ['Sra'], (err, user) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (!user) {
        console.log('未找到 Sra 用户');
        resolve();
        return;
      }
      
      console.log('找到用户 Sra，ID:', user.id);
      
      // 分配管理员角色 (role_id = 1)
      db.run('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, 1)', [user.id], (err) => {
        if (err) {
          reject(err);
          return;
        }
        console.log('已为 Sra 用户分配管理员角色');
        resolve();
      });
    });
  });
}

assignAdminRole()
  .then(() => {
    db.close();
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    db.close();
    process.exit(1);
  });

