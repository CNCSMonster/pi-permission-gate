#!/bin/bash
# pi-permission-gate 开发环境一键设置脚本
# 新机器上快速进入开发模式

set -e

REPO_URL="https://github.com/CNCSMonster/pi-permission-gate"
DEV_DIR="${1:-$HOME/my-programs/pi-permission-gate}"
PI_EXT_DIR="$HOME/.pi/agent/extensions"

echo "🔧 pi-permission-gate 开发环境设置"
echo "=================================="
echo ""

# 1. 检查 pi 是否安装
if ! command -v pi &> /dev/null; then
    echo "❌ 请先安装 pi: npm install -g @mariozechner/pi-coding-agent"
    exit 1
fi
echo "✅ pi 已安装"

# 2. 克隆仓库（如果不存在）
if [ ! -d "$DEV_DIR/.git" ]; then
    echo "📥 克隆仓库到 $DEV_DIR..."
    mkdir -p "$(dirname "$DEV_DIR")"
    git clone "$REPO_URL" "$DEV_DIR"
else
    echo "📁 仓库已存在，拉取最新代码..."
    cd "$DEV_DIR" && git pull
fi
echo "✅ 代码就绪"

# 3. 创建符号链接
echo "🔗 创建符号链接..."
mkdir -p "$PI_EXT_DIR"
ln -sf "$DEV_DIR/extensions/permission-gate-enhanced.ts" "$PI_EXT_DIR/"
echo "✅ 符号链接已创建"
echo "   $PI_EXT_DIR/permission-gate-enhanced.ts -> $DEV_DIR/extensions/permission-gate-enhanced.ts"

# 4. 验证
echo ""
echo "📊 验证状态:"
if [ -L "$PI_EXT_DIR/permission-gate-enhanced.ts" ]; then
    echo "   ✅ 开发模式已启用"
    echo ""
    echo "💡 快速开始:"
    echo "   1. 启动 pi:    pi"
    echo "   2. 修改代码:   vim $DEV_DIR/extensions/permission-gate-enhanced.ts"
    echo "   3. 重载扩展:   在 pi 中执行 /reload"
    echo "   4. 提交修改:   cd $DEV_DIR && git add -A && git commit -m '...' && git push"
    echo ""
    echo "📁 项目目录: $DEV_DIR"
else
    echo "   ❌ 设置失败"
    exit 1
fi
