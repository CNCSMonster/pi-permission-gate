#!/bin/bash
# pi-permission-gate 开发模式切换脚本

DEV_DIR="$HOME/my-programs/pi-permission-gate"
EXT_FILE="$DEV_DIR/extensions/permission-gate-enhanced.ts"
PI_EXT_DIR="$HOME/.pi/agent/extensions"
GITHUB_PKG="git:github.com/CNCSMonster/pi-permission-gate"

case "${1:-status}" in
    dev|on)
        echo "🔧 切换到开发模式..."
        # 移除 GitHub 版本
        pi remove "$GITHUB_PKG" 2>/dev/null || true
        # 创建符号链接
        ln -sf "$EXT_FILE" "$PI_EXT_DIR/"
        echo "✅ 开发模式已启用"
        echo "   扩展路径: $PI_EXT_DIR/permission-gate-enhanced.ts -> $EXT_FILE"
        echo ""
        echo "💡 修改代码后，在 pi 中执行 /reload 即可生效"
        ;;

    use|off)
        echo "📦 切换到使用模式（GitHub 版本）..."
        # 删除本地符号链接
        rm -f "$PI_EXT_DIR/permission-gate-enhanced.ts"
        # 安装 GitHub 版本
        pi install "$GITHUB_PKG"
        echo "✅ 使用模式已启用"
        echo "   扩展来源: $GITHUB_PKG"
        ;;

    reload|rl)
        echo "🔄 重新加载扩展..."
        if [ -L "$PI_EXT_DIR/permission-gate-enhanced.ts" ]; then
            echo "当前模式: 开发模式（本地）"
            echo "修改代码后执行 /reload 即可生效"
        else
            echo "当前模式: 使用模式（GitHub）"
            echo "执行 pi update 更新到最新版"
        fi
        ;;

    status|st)
        echo "📊 当前状态:"
        if [ -L "$PI_EXT_DIR/permission-gate-enhanced.ts" ]; then
            echo "   模式: 🔧 开发模式"
            echo "   链接: $(readlink "$PI_EXT_DIR/permission-gate-enhanced.ts")"
        elif [ -f "$PI_EXT_DIR/permission-gate-enhanced.ts" ]; then
            echo "   模式: 📁 本地文件（非符号链接）"
        else
            echo "   模式: 📦 使用模式（可能通过 packages 加载）"
        fi
        echo ""
        echo "可用命令:"
        echo "   $0 dev    - 切换到开发模式"
        echo "   $0 use    - 切换到使用模式"
        echo "   $0 status - 查看当前状态"
        ;;

    *)
        echo "用法: $0 {dev|use|status|reload}"
        echo ""
        echo "  dev     - 切换到开发模式（本地符号链接）"
        echo "  use     - 切换到使用模式（GitHub 版本）"
        echo "  status  - 查看当前状态"
        echo "  reload  - 显示重载提示"
        exit 1
        ;;
esac
