This is a Next.js project bootstrapped with create-next-app.
This project uses Ollama to deploy a fully local LLM.


## Getting Started

First, pull the Mistral 7B (v0.3) LLM from Ollama's repository and start the server.

```bash
ollama pull mistral
#and
ollama serve
```

Finally, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.