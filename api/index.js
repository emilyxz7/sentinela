const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// ======================================================
// BANCO DE DADOS
// ======================================================

const DB_FILE = path.join(__dirname, "../backend/db.json");

function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return {
        usuarios: [],
        pacientes: [],
        triagens: [],
        consultas: []
      };
    }

    const data = fs.readFileSync(DB_FILE, "utf8");

    if (!data.trim()) {
      return {
        usuarios: [],
        pacientes: [],
        triagens: [],
        consultas: []
      };
    }

    return JSON.parse(data);
  } catch (error) {
    console.error("Erro ao ler banco de dados:", error);

    return {
      usuarios: [],
      pacientes: [],
      triagens: [],
      consultas: []
    };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    return true;
  } catch (error) {
    console.error("Erro ao salvar banco de dados:", error);
    return false;
  }
}

// ======================================================
// ROTA PRINCIPAL
// ======================================================

app.get("/", (req, res) => {
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Sistema Sentinela</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: Arial, sans-serif;
            background: #f4f7fb;
            color: #1f2937;
          }

          .container {
            width: 90%;
            max-width: 600px;
            background: white;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
            text-align: center;
          }

          h1 {
            margin-top: 0;
          }

          .status {
            display: inline-block;
            margin-top: 10px;
            padding: 10px 18px;
            border-radius: 999px;
            background: #dcfce7;
            color: #166534;
            font-weight: bold;
          }

          p {
            line-height: 1.6;
          }
        </style>
      </head>

      <body>
        <div class="container">
          <h1>Sistema Sentinela</h1>

          <div class="status">
            Sistema funcionando
          </div>

          <p>
            A API do Sistema Sentinela está online.
          </p>

          <p>
            Endpoint: <strong>/api</strong>
          </p>
        </div>
      </body>
    </html>
  `);
});

// ======================================================
// STATUS DA API
// ======================================================

app.get("/status", (req, res) => {
  res.json({
    sistema: "Sentinela",
    status: "online",
    mensagem: "API funcionando corretamente"
  });
});

// ======================================================
// LOGIN
// ======================================================

app.post("/login", (req, res) => {
  try {
    const db = readDB();

    const usuario = req.body.usuario;
    const senha = req.body.senha;

    if (!usuario || !senha) {
      return res.status(400).json({
        erro: "Usuário e senha são obrigatórios"
      });
    }

    const user = db.usuarios.find(
      (u) =>
        u.usuario === usuario &&
        u.senha === senha
    );

    if (!user) {
      return res.status(401).json({
        erro: "Login inválido"
      });
    }

    return res.json(user);

  } catch (error) {
    console.error("Erro no login:", error);

    return res.status(500).json({
      erro: "Erro interno no servidor"
    });
  }
});

// ======================================================
// ATENDIMENTO
// ======================================================

app.post("/atendimento", (req, res) => {
  try {
    const db = readDB();

    const paciente = {
      id: Date.now(),
      nome: req.body.nome,
      cpf: req.body.cpf,
      tipo: req.body.tipo,
      status: "triagem",
      createdAt: new Date().toISOString()
    };

    db.pacientes.push(paciente);

    if (!writeDB(db)) {
      return res.status(500).json({
        erro: "Não foi possível salvar o paciente"
      });
    }

    return res.json(paciente);

  } catch (error) {
    console.error("Erro no atendimento:", error);

    return res.status(500).json({
      erro: "Erro interno no servidor"
    });
  }
});

// ======================================================
// TRIAGEM
// ======================================================

app.post("/triagem", (req, res) => {
  try {
    const db = readDB();

    let risco = req.body.risco;

    const temperatura = Number(req.body.temperatura);

    if (temperatura >= 39) {
      risco = "vermelho";
    } else if (temperatura >= 38) {
      risco = "amarelo";
    } else if (!risco) {
      risco = "verde";
    }

    const triagem = {
      id: Date.now(),
      nome: req.body.nome,
      sintoma: req.body.sintoma,
      temperatura: temperatura || null,
      alergia: req.body.alergia,
      observacao: req.body.observacao,
      risco,
      status: "aguardando_medico",
      createdAt: new Date().toISOString()
    };

    db.triagens.push(triagem);

    if (!writeDB(db)) {
      return res.status(500).json({
        erro: "Não foi possível salvar a triagem"
      });
    }

    return res.json(triagem);

  } catch (error) {
    console.error("Erro na triagem:", error);

    return res.status(500).json({
      erro: "Erro interno no servidor"
    });
  }
});

// ======================================================
// LISTAR TRIAGENS
// ======================================================

app.get("/triagens", (req, res) => {
  try {
    const db = readDB();

    return res.json(db.triagens || []);

  } catch (error) {
    console.error("Erro ao listar triagens:", error);

    return res.status(500).json({
      erro: "Não foi possível carregar as triagens"
    });
  }
});

// ======================================================
// LISTA DE MEDICAÇÕES
// ======================================================

app.get("/lista-medicacoes", (req, res) => {
  res.json([
    "Dipirona",
    "Paracetamol",
    "Ibuprofeno",
    "Amoxicilina",
    "Azitromicina",
    "Loratadina",
    "Omeprazol",
    "Buscopan",
    "Dramin",
    "Soro fisiológico"
  ]);
});

// ======================================================
// CONSULTA
// ======================================================

app.post("/consulta", (req, res) => {
  try {
    const db = readDB();

    const consulta = {
      id: Date.now(),
      paciente: req.body.paciente,
      diagnostico: req.body.diagnostico,
      medicacao: req.body.medicacao,
      obs: req.body.obs,
      createdAt: new Date().toISOString()
    };

    db.consultas.push(consulta);

    if (!writeDB(db)) {
      return res.status(500).json({
        erro: "Não foi possível salvar a consulta"
      });
    }

    return res.json(consulta);

  } catch (error) {
    console.error("Erro na consulta:", error);

    return res.status(500).json({
      erro: "Erro interno no servidor"
    });
  }
});

// ======================================================
// MEDICAÇÕES / CONSULTAS
// ======================================================

app.get("/medicacoes", (req, res) => {
  try {
    const db = readDB();

    return res.json(db.consultas || []);

  } catch (error) {
    console.error("Erro ao carregar medicações:", error);

    return res.status(500).json({
      erro: "Não foi possível carregar os dados"
    });
  }
});

// ======================================================
// PACIENTES
// ======================================================

app.get("/pacientes", (req, res) => {
  try {
    const db = readDB();

    return res.json(db.pacientes || []);

  } catch (error) {
    console.error("Erro ao listar pacientes:", error);

    return res.status(500).json({
      erro: "Não foi possível carregar os pacientes"
    });
  }
});

// ======================================================
// USUÁRIOS
// ======================================================

app.get("/usuarios", (req, res) => {
  try {
    const db = readDB();

    return res.json(db.usuarios || []);

  } catch (error) {
    console.error("Erro ao listar usuários:", error);

    return res.status(500).json({
      erro: "Não foi possível carregar os usuários"
    });
  }
});

// ======================================================
// TRATAMENTO DE ROTAS NÃO ENCONTRADAS
// ======================================================

app.use((req, res) => {
  res.status(404).json({
    erro: "Rota não encontrada",
    rota: req.originalUrl
  });
});

// ======================================================
// TRATAMENTO DE ERROS
// ======================================================

app.use((error, req, res, next) => {
  console.error("Erro geral:", error);

  res.status(500).json({
    erro: "Erro interno do servidor"
  });
});

// ======================================================
// VERCEL
// ======================================================

module.exports = app;
