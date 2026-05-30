# 开发工作流

## 快速开始（新机器）

```bash
# 一键设置开发环境
curl -sL https://raw.githubusercontent.com/CNCSMonster/pi-permission-gate/main/scripts/dev-setup.sh | bash

# 或手动克隆
git clone https://github.com/CNCSMonster/pi-permission-gate ~/my-programs/pi-permission-gate
cd ~/my-programs/pi-permission-gate
./scripts/dev-setup.sh
```

## 日常开发循环

```
修改代码
    ↓
pi 中执行 /reload
    ↓
测试效果
    ↓
满意？→ git commit & git push
    ↓
不满意？→ 继续修改
```

## 多机器协作

### Machine A（主开发机）
```bash
# 修改代码
cd ~/my-programs/pi-permission-gate
vim extensions/permission-gate-enhanced.ts

# 提交
git add -A
git commit -m "feat: add xxx"
git push
```

### Machine B（新机器）
```bash
# 拉取最新代码
cd ~/my-programs/pi-permission-gate
git pull

# 自动生效（因为符号链接指向最新代码）
# 在 pi 中执行 /reload
```

## 快速体验修改效果

### 方式 1：/reload（推荐）
```bash
# 在 pi 交互界面中
/reload
```

### 方式 2：临时加载
```bash
# 不安装，仅本次测试
pi -e ~/my-programs/pi-permission-gate
```

### 方式 3：重启 pi
```bash
# 退出并重新启动
Ctrl+D
pi
```

## 切换开发/使用模式

```bash
# 进入开发模式（本地符号链接）
./scripts/dev-mode.sh dev

# 进入使用模式（GitHub 版本）
./scripts/dev-mode.sh use

# 查看当前状态
./scripts/dev-mode.sh status
```

## 提交修改到上游

```bash
# 1. 修改代码
vim extensions/permission-gate-enhanced.ts

# 2. 测试
pi
# /reload
# 测试效果
# Ctrl+D 退出

# 3. 提交
git add -A
git commit -m "feat: xxx / fix: xxx"
git push

# 4. 更新安装版本（如果使用 GitHub 安装）
pi update
```

## 文件结构

```
pi-permission-gate/
├── extensions/
│   └── permission-gate-enhanced.ts    # ← 主代码（修改这个）
├── scripts/
│   ├── dev-setup.sh                    # 新机器一键设置
│   └── dev-mode.sh                     # 开发/使用模式切换
├── package.json
├── README.md
└── LICENSE
```

## 常见问题

**Q: 修改后没有生效？**
A: 确保执行了 `/reload`，且处于开发模式（符号链接存在）

**Q: 如何确认是开发模式？**
A: `ls -la ~/.pi/agent/extensions/permission-gate-enhanced.ts` 应该显示为符号链接

**Q: 两个扩展冲突？**
A: 确保没有同时存在本地符号链接和 GitHub 安装版本。使用 `./scripts/dev-mode.sh status` 检查
