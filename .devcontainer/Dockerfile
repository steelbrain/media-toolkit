FROM node:22

ARG TZ
ENV TZ="$TZ"


# Install basic development tools
RUN apt update && apt install -y less \
  git \
  procps \
  unzip \
  gnupg2 \
  jq \
  nano

# Ensure default node user has access to /usr/local/share
RUN mkdir -p /usr/local/share/npm-global && \
  chown -R node:node /usr/local/share

# Persist bash history.
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
    && mkdir /commandhistory \
    && touch /commandhistory/.bash_history \
    && chown -R node /commandhistory \
    && echo "$SNIPPET" >> "/home/node/.bashrc"

# Install shell experience util
RUN curl -sS https://starship.rs/install.sh | sh -s -- -y \
    && echo 'eval "$(starship init bash)"' >> "/home/node/.bashrc"

# Enable corepack and install yarn
RUN corepack enable

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Create workspace and config directories and set permissions
RUN mkdir -p /workspace /home/node/.claude && \
  chown -R node:node /workspace /home/node/.claude

# Run as non-root user
USER node

# Configure the terminal experience
RUN mkdir -p /home/node/.config && \
    curl -L "https://gist.github.com/steelbrain/f4bcb4079e5cc1b51407e77c61228012/raw/b97f4461b73f823ff3f39c7c3e7a11a0b4b12f30/starship.toml" -o /home/node/.config/starship.toml

WORKDIR /workspace

# Install global packages
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Install Claude
RUN npm install -g @anthropic-ai/claude-code
