# 发布到 GitHub

当前仓库已经是一个可发布的 git 仓库（本地 `main` 分支），但没有配置 remote。
由于本环境没有 `gh` CLI，实际推送需要你本机操作或提供远程仓库地址。

## 方式一：本机命令行发布

```bash
cd /path/to/dsh-session-slim

# 1. 在 GitHub 网页创建空仓库，例如 dsh-session-slim
# 2. 添加 remote 并推送
git remote add origin git@github.com:<your-name>/dsh-session-slim.git
git push -u origin main

# 3. 可选：创建 tag 和 GitHub Release
git tag v0.1.0
git push origin v0.1.0
```

## 方式二：使用 gh CLI

```bash
cd /path/to/dsh-session-slim
gh repo create dsh-session-slim --public --source=. --remote=origin --push
gh release create v0.1.0 dsh-external-dsh-session-slim-0.1.0.tgz --title "v0.1.0" --notes "DSH session memory/performance optimizer"
```

## 发布前检查

- [x] `bash scripts/build.sh` 构建通过
- [x] `dev_build_plugin` 打包通过
- [x] README 包含安装与核心补丁说明
- [x] LICENSE 存在
- [ ] 创建 GitHub 仓库并推送
- [ ] 上传 `dsh-external-dsh-session-slim-0.1.0.tgz` 到 Release
