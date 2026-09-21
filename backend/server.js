const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

const DB_FILE = path.join(__dirname, "db.json");
const FRONTEND_DIR = path.join(__dirname, "../frontend");

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

// Banco de dados
function criarBancoSeNaoExistir() {
  if (!fs.existsSync(DB_FILE)) {
    const bancoInicial = {
      usuarios: [
        {
          usuario: "triagem",
          senha: "123",
          tipo: "triagem"
        },
        {
          usuario: "medico",
          senha: "123",
          tipo: "medico"
        },
        {
          usuario: "atendimento",
          senha: "123",
          tipo: "atendimento"
        }
      ],
      pacientes: [],
      triagens: [],
      consultas: [],
      tv_chamada: {},
      tv_historico: []
    };

    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(bancoInicial, null, 2),
      "utf8"
    );
  }
}

function lerBanco() {
  criarBancoSeNaoExistir();

  try {
    const conteudo = fs.readFileSync(DB_FILE, "utf8");
    const banco = JSON.parse(conteudo);

    banco.usuarios = Array.isArray(banco.usuarios)
      ? banco.usuarios
      : [];

    banco.pacientes = Array.isArray(banco.pacientes)
      ? banco.pacientes
      : [];

    banco.triagens = Array.isArray(banco.triagens)
      ? banco.triagens
      : [];

    banco.consultas = Array.isArray(banco.consultas)
      ? banco.consultas
      : [];

    banco.tv_historico = Array.isArray(banco.tv_historico)
      ? banco.tv_historico
      : [];

    if (!banco.tv_chamada || typeof banco.tv_chamada !== "object") {
      banco.tv_chamada = {};
    }

    return banco;
  } catch (erro) {
    console.error("Erro ao ler o db.json:", erro);
    throw new Error("Não foi possível ler o banco de dados.");
  }
}

function salvarBanco(banco) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(banco, null, 2),
    "utf8"
  );
}

function gerarId() {
  return Date.now();
}

// Sistema simples de sessão
const sessoes = new Map();

function obterCookies(req) {
  const cookies = {};

  const textoCookies = req.headers.cookie;

  if (!textoCookies) {
    return cookies;
  }

  textoCookies.split(";").forEach((cookie) => {
    const partes = cookie.trim().split("=");

    const nome = partes.shift();
    const valor = partes.join("=");

    if (nome) {
      cookies[nome] = decodeURIComponent(valor || "");
    }
  });

  return cookies;
}

function criarSessao(usuario) {
  const token = crypto.randomBytes(32).toString("hex");

  sessoes.set(token, {
    usuario: usuario.usuario,
    tipo: usuario.tipo,
    criadoEm: Date.now()
  });

  return token;
}

function obterUsuarioLogado(req) {
  const cookies = obterCookies(req);
  const token = cookies.saude_integra_sessao;

  if (!token) {
    return null;
  }

  return sessoes.get(token) || null;
}

function exigirLogin(req, res, proximo) {
  const usuario = obterUsuarioLogado(req);

  if (!usuario) {
    return res.status(401).json({
      sucesso: false,
      mensagem: "Você precisa fazer login."
    });
  }

  req.usuarioLogado = usuario;
  proximo();
}

function exigirTipo(...tiposPermitidos) {
  return (req, res, proximo) => {
    const usuario = obterUsuarioLogado(req);

    if (!usuario) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Sessão não encontrada."
      });
    }

    if (!tiposPermitidos.includes(usuario.tipo)) {
      return res.status(403).json({
        sucesso: false,
        mensagem: "Você não possui permissão para acessar esta área."
      });
    }

    req.usuarioLogado = usuario;
    proximo();
  };
}

// Rota principal
app.get("/", (req, res) => {
  const arquivoIndex = path.join(FRONTEND_DIR, "index.html");

  if (fs.existsSync(arquivoIndex)) {
    return res.sendFile(arquivoIndex);
  }

  res.send(`
    <h1>Saúde Integra</h1>
    <p>O sistema está funcionando, mas o arquivo index.html não foi encontrado.</p>
  `);
});

// Arquivos do frontend
app.use(express.static(FRONTEND_DIR));

// LOGIN
app.post("/login", (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({
      sucesso: false,
      mensagem: "Informe o usuário e a senha."
    });
  }

  const banco = lerBanco();

  const usuarioEncontrado = banco.usuarios.find((item) => {
    return (
      String(item.usuario).trim() === String(usuario).trim() &&
      String(item.senha) === String(senha)
    );
  });

  if (!usuarioEncontrado) {
    return res.status(401).json({
      sucesso: false,
      mensagem: "Usuário ou senha inválidos."
    });
  }

  const token = criarSessao(usuarioEncontrado);

  res.setHeader(
    "Set-Cookie",
    `saude_integra_sessao=${token}; Path=/; HttpOnly; SameSite=Lax`
  );

  res.json({
    sucesso: true,
    mensagem: "Login realizado com sucesso.",
    usuario: usuarioEncontrado.usuario,
    tipo: usuarioEncontrado.tipo
  });
});

// VERIFICAR SESSÃO
app.get("/sessao", exigirLogin, (req, res) => {
  res.json({
    sucesso: true,
    usuario: req.usuarioLogado
  });
});

// SAIR
app.post("/logout", (req, res) => {
  const cookies = obterCookies(req);
  const token = cookies.saude_integra_sessao;

  if (token) {
    sessoes.delete(token);
  }

  res.setHeader(
    "Set-Cookie",
    "saude_integra_sessao=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax"
  );

  res.json({
    sucesso: true,
    mensagem: "Sessão encerrada."
  });
});

// CADASTRAR PACIENTE
app.post(
  "/atendimento",
  exigirTipo("atendimento"),
  (req, res) => {
    const { nome, cpf, tipo } = req.body;

    if (!nome || !String(nome).trim()) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe o nome do paciente."
      });
    }

    const banco = lerBanco();

    const paciente = {
      id: gerarId(),
      nome: String(nome).trim(),
      cpf: cpf ? String(cpf).trim() : "",
      tipo: tipo || "Particular",
      status: "triagem",
      createdAt: new Date().toISOString()
    };

    banco.pacientes.push(paciente);

    salvarBanco(banco);

    res.status(201).json({
      sucesso: true,
      mensagem: "Paciente cadastrado e enviado para a triagem.",
      paciente
    });
  }
);

// LISTAR PACIENTES
app.get(
  "/pacientes",
  exigirLogin,
  (req, res) => {
    const banco = lerBanco();

    res.json(banco.pacientes);
  }
);

// CADASTRAR TRIAGEM
app.post(
  "/triagem",
  exigirTipo("triagem"),
  (req, res) => {
    const {
      pacienteId,
      nome,
      sintoma,
      sintomas,
      temperatura,
      temp,
      alergia,
      observacao,
      risco
    } = req.body;

    if (!nome || !String(nome).trim()) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe o nome do paciente."
      });
    }

    const banco = lerBanco();

    const novaTriagem = {
      id: gerarId(),
      pacienteId: pacienteId || null,
      nome: String(nome).trim(),
      sintoma: sintoma || sintomas || "",
      sintomas: sintomas || sintoma || "",
      temperatura: temperatura || temp || "",
      temp: temp || temperatura || "",
      alergia: alergia || "",
      observacao: observacao || "",
      risco: risco || "verde",
      status: "aguardando_medico",
      createdAt: new Date().toISOString()
    };

    banco.triagens.push(novaTriagem);

    const paciente = banco.pacientes.find((item) => {
      return (
        String(item.id) === String(pacienteId) ||
        String(item.nome).trim().toLowerCase() ===
          String(nome).trim().toLowerCase()
      );
    });

    if (paciente) {
      paciente.status = "aguardando_medico";
    }

    salvarBanco(banco);

    res.status(201).json({
      sucesso: true,
      mensagem: "Triagem registrada com sucesso.",
      triagem: novaTriagem
    });
  }
);

// LISTAR TRIAGENS PARA O MÉDICO
app.get(
  "/triagens",
  exigirTipo("medico"),
  (req, res) => {
    const banco = lerBanco();

    const triagensAguardando = banco.triagens.filter((triagem) => {
      return (
        !triagem.status ||
        triagem.status === "aguardando_medico" ||
        triagem.status === "triagem"
      );
    });

    const resultado = triagensAguardando.map((triagem) => {
      return {
        ...triagem,
        sintoma: triagem.sintoma || triagem.sintomas || "Não informado",
        sintomas: triagem.sintomas || triagem.sintoma || "Não informado",
        temperatura:
          triagem.temperatura || triagem.temp || "Não informada",
        temp: triagem.temp || triagem.temperatura || "Não informada",
        alergia: triagem.alergia || "Nenhuma",
        observacao: triagem.observacao || "Nenhuma"
      };
    });

    res.json(resultado);
  }
);

// FINALIZAR CONSULTA
app.post(
  "/consulta",
  exigirTipo("medico"),
  (req, res) => {
    const {
      pacienteId,
      triagemId,
      paciente,
      diagnostico,
      medicacao,
      obs
    } = req.body;

    if (!paciente || !String(paciente).trim()) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Selecione um paciente."
      });
    }

    const banco = lerBanco();

    const novaConsulta = {
      id: gerarId(),
      paciente: String(paciente).trim(),
      diagnostico: diagnostico || "",
      medicacao: medicacao || "",
      obs: obs || "",
      createdAt: new Date().toISOString()
    };

    banco.consultas.push(novaConsulta);

    let triagemEncontrada = null;

    if (triagemId) {
      triagemEncontrada = banco.triagens.find((item) => {
        return String(item.id) === String(triagemId);
      });
    }

    if (!triagemEncontrada) {
      triagemEncontrada = banco.triagens.find((item) => {
        return (
          String(item.nome).trim().toLowerCase() ===
          String(paciente).trim().toLowerCase()
        );
      });
    }

    if (triagemEncontrada) {
      triagemEncontrada.status = "atendido";
      triagemEncontrada.atendidoEm = new Date().toISOString();
    }

    const pacienteEncontrado = banco.pacientes.find((item) => {
      if (pacienteId && String(item.id) === String(pacienteId)) {
        return true;
      }

      return (
        String(item.nome).trim().toLowerCase() ===
        String(paciente).trim().toLowerCase()
      );
    });

    if (pacienteEncontrado) {
      pacienteEncontrado.status = "consulta_finalizada";
    }

    salvarBanco(banco);

    res.status(201).json({
      sucesso: true,
      mensagem: "Consulta finalizada com sucesso.",
      consulta: novaConsulta
    });
  }
);

// LISTAR MEDICAÇÕES PRESCRITAS
app.get(
  "/medicacoes",
  exigirLogin,
  (req, res) => {
    const banco = lerBanco();

    const medicacoes = banco.consultas
      .filter((consulta) => {
        return consulta.medicacao && String(consulta.medicacao).trim();
      })
      .map((consulta) => {
        return {
          id: consulta.id,
          paciente: consulta.paciente || "Não informado",
          diagnostico: consulta.diagnostico || "Não informado",
          medicacao: consulta.medicacao,
          obs: consulta.obs || "Nenhuma",
          createdAt: consulta.createdAt
        };
      });

    res.json(medicacoes);
  }
);

// LISTA DE MEDICAÇÕES PARA O MÉDICO
app.get(
  "/lista-medicacoes",
  exigirTipo("medico"),
  (req, res) => {
    const banco = lerBanco();

    const lista = [];

    banco.consultas.forEach((consulta) => {
      if (
        consulta.medicacao &&
        String(consulta.medicacao).trim() &&
        !lista.includes(consulta.medicacao)
      ) {
        lista.push(consulta.medicacao);
      }
    });

    const medicacoesPadrao = [
      "Dipirona",
      "Paracetamol",
      "Amoxicilina",
      "Omeprazol",
      "Soro fisiológico"
    ];

    medicacoesPadrao.forEach((medicacao) => {
      if (!lista.includes(medicacao)) {
        lista.push(medicacao);
      }
    });

    res.json(lista);
  }
);

// DAR ALTA AO PACIENTE
app.post(
  "/alta",
  exigirTipo("medico"),
  (req, res) => {
    const { pacienteId, paciente, observacao } = req.body;

    if (!pacienteId && !paciente) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe o paciente."
      });
    }

    const banco = lerBanco();

    const pacienteEncontrado = banco.pacientes.find((item) => {
      if (pacienteId && String(item.id) === String(pacienteId)) {
        return true;
      }

      if (paciente) {
        return (
          String(item.nome).trim().toLowerCase() ===
          String(paciente).trim().toLowerCase()
        );
      }

      return false;
    });

    if (!pacienteEncontrado) {
      return res.status(404).json({
        sucesso: false,
        mensagem: "Paciente não encontrado."
      });
    }

    pacienteEncontrado.status = "alta";
    pacienteEncontrado.altaEm = new Date().toISOString();
    pacienteEncontrado.observacaoAlta = observacao || "";

    salvarBanco(banco);

    res.json({
      sucesso: true,
      mensagem: "Alta registrada com sucesso.",
      paciente: pacienteEncontrado
    });
  }
);

// CHAMAR PACIENTE NA TELEVISÃO
app.post(
  "/tv/chamar",
  exigirTipo("medico"),
  (req, res) => {
    const {
      localTipo,
      localNumero,
      paciente
    } = req.body;

    if (!paciente || !String(paciente).trim()) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe o nome do paciente."
      });
    }

    const banco = lerBanco();

    const agora = new Date();

    const hora = agora.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    });

    const chamada = {
      id: String(gerarId()),
      localTipo: localTipo || "CONSULTÓRIO",
      localNumero: localNumero || "01",
      paciente: String(paciente).trim(),
      hora
    };

    banco.tv_chamada = chamada;

    banco.tv_historico.unshift(chamada);

    if (banco.tv_historico.length > 50) {
      banco.tv_historico = banco.tv_historico.slice(0, 50);
    }

    salvarBanco(banco);

    res.json({
      sucesso: true,
      mensagem: "Paciente chamado na televisão.",
      chamada
    });
  }
);

// CONSULTAR CHAMADA ATUAL DA TV
app.get("/tv/atual", (req, res) => {
  const banco = lerBanco();

  res.json(banco.tv_chamada || {});
});

// HISTÓRICO DA TV
app.get(
  "/tv/historico",
  exigirLogin,
  (req, res) => {
    const banco = lerBanco();

    res.json(banco.tv_historico);
  }
);

// ROTA DE TESTE
app.get("/status", (req, res) => {
  res.json({
    sucesso: true,
    sistema: "Saúde Integra",
    status: "online",
    data: new Date().toISOString()
  });
});

// Tratamento de rota inexistente da API
app.use("/api", (req, res) => {
  res.status(404).json({
    sucesso: false,
    mensagem: "Rota da API não encontrada."
  });
});

// Tratamento de erros
app.use((erro, req, res, next) => {
  console.error("Erro interno:", erro);

  res.status(500).json({
    sucesso: false,
    mensagem: "Ocorreu um erro interno no servidor."
  });
});

// Iniciar servidor
app.listen(PORT, "0.0.0.0", () => {
  console.log("======================================");
  console.log("       SAÚDE INTEGRA ONLINE");
  console.log("======================================");
  console.log(`Servidor iniciado na porta ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT}`);
});
