# LeetCode Runner Docker Image
# 6言語対応 (Python, JavaScript, TypeScript, Java, Go, Swift)

FROM ubuntu:22.04

# 環境変数設定
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# 基本パッケージのインストール
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    jq \
    bc \
    && rm -rf /var/lib/apt/lists/*

# Python 3.11
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3-pip \
    && ln -sf /usr/bin/python3.11 /usr/bin/python \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3 \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20 (JavaScript/TypeScript)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g esbuild typescript \
    && rm -rf /var/lib/apt/lists/*

# OpenJDK 17 (Java)
RUN apt-get update && apt-get install -y \
    openjdk-17-jdk \
    && rm -rf /var/lib/apt/lists/*
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

# Go 1.21
RUN wget -q https://go.dev/dl/go1.21.0.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz \
    && rm go1.21.0.linux-amd64.tar.gz
ENV PATH=$PATH:/usr/local/go/bin
ENV GOPATH=/go
ENV PATH=$PATH:$GOPATH/bin

# Swift 5.9
RUN apt-get update && apt-get install -y \
    binutils \
    libc6-dev \
    libcurl4-openssl-dev \
    libedit2 \
    libgcc-11-dev \
    libpython3.11 \
    libsqlite3-0 \
    libstdc++-11-dev \
    libxml2-dev \
    libz3-dev \
    pkg-config \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN wget -q https://download.swift.org/swift-5.9.2-release/ubuntu2204/swift-5.9.2-RELEASE/swift-5.9.2-RELEASE-ubuntu22.04.tar.gz \
    && tar -xzf swift-5.9.2-RELEASE-ubuntu22.04.tar.gz -C /usr --strip-components=2 \
    && rm swift-5.9.2-RELEASE-ubuntu22.04.tar.gz

# LeetCode ヘルパーライブラリのセットアップ
WORKDIR /leetcode

# Python ヘルパー
COPY helpers/python/leetcode_helper.py /leetcode/helpers/python/

# JavaScript/TypeScript ヘルパー
COPY helpers/javascript/leetcode_helper.js /leetcode/helpers/javascript/
COPY helpers/javascript/leetcode_helper.d.ts /leetcode/helpers/javascript/

# Java ヘルパー
COPY helpers/java/ListNode.java /leetcode/helpers/java/
COPY helpers/java/TreeNode.java /leetcode/helpers/java/

# Go ヘルパー
COPY helpers/go/leetcode_helper.go /leetcode/helpers/go/

# Swift ヘルパー
COPY helpers/swift/LeetCodeHelper.swift /leetcode/helpers/swift/

# ランナースクリプト
COPY runner.sh /leetcode/runner.sh
RUN chmod +x /leetcode/runner.sh

# 非rootユーザーの作成（セキュリティ）
RUN useradd -m -s /bin/bash leetcode
USER leetcode

# 作業ディレクトリ
WORKDIR /workspace

# デフォルトコマンド
ENTRYPOINT ["/leetcode/runner.sh"]
