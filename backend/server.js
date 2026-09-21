const express = require("express");
const session = require("express-session");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const DB_FILE = path.join(__dirname, "db.json");
const FRONTEND = path.join(__dirname, "../frontend");

// ======================================================
// CONFIGURAÇÕES
// ======================================================

app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || "saude-integra-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 1000 * 60 * 60 * 8
    }
}));

// ======================================================
// BANCO DE DADOS JSON
// ======================================================

function criarBancoSeNaoExistir() {
    if (!fs.existsSync(DB_FILE)) {
        const bancoInicial = {
            usuarios: [],
            pacientes: [],
            triagens: [],
            consultas: [],
            tv_chamada: null,
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

        if (!conteudo.trim()) {
            return {
                usuarios: [],
                pacientes: [],
                triagens: [],
                consultas: [],
                tv_chamada: null,
                tv_historico: []
            };
        }

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

        if (!Object.prototype.hasOwnProperty.call(banco, "tv_chamada")) {
            banco.tv_chamada = null;
        }

        return banco;

    } catch (erro) {
        console.error("Erro ao ler db.json:", erro);

        return {
            usuarios: [],
            pacientes: [],
            triagens: [],
            consultas: [],
            tv_chamada: null,
            tv_historico: []
        };
    }
}

function salvarBanco(banco) {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(banco, null, 2),
        "utf8"
    );
}

// ======================================================
// FUNÇÕES AUXILIARES
// ======================================================

function gerarId() {
    return Date.now() + Math.floor(Math.random() * 1000);
}

function horaAtual() {
    return new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function dataAtual() {
    return new Date().toISOString();
}

// ======================================================
// AUTENTICAÇÃO
// ======================================================

function exigeLogin(req, res, next) {
    if (!req.session.usuario) {
        return res.status(401).json({
            sucesso: false,
            mensagem: "Usuário não autenticado."
        });
    }

    next();
}

function exigeTipo(...tiposPermitidos) {
    return (req, res, next) => {

        if (!req.session.usuario) {
            return res.status(401).json({
                sucesso: false,
                mensagem: "Usuário não autenticado."
            });
        }

        if (!tiposPermitidos.includes(req.session.usuario.tipo)) {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Acesso não permitido."
            });
        }

        next();
    };
}

// ======================================================
// PÁGINA PRINCIPAL
// ======================================================

app.get("/", (req, res) => {
    res.sendFile(path.join(FRONTEND, "index.html"));
});

// ======================================================
// LOGIN
// ======================================================

app.post("/login", (req, res) => {

    const usuarioDigitado = String(req.body.usuario || "").trim();
    const senhaDigitada = String(req.body.senha || "").trim();

    if (!usuarioDigitado || !senhaDigitada) {
        return res.status(400).json({
            sucesso: false,
            mensagem: "Informe usuário e senha."
        });
    }

    const banco = lerBanco();

    const usuario = banco.usuarios.find((u) =>
        String(u.usuario).trim() === usuarioDigitado &&
        String(u.senha).trim() === senhaDigitada
    );

    if (!usuario) {
        return res.status(401).json({
            sucesso: false,
            mensagem: "Usuário ou senha inválidos."
        });
    }

    req.session.usuario = {
        usuario: usuario.usuario,
        tipo: usuario.tipo
    };

    return res.json({
        sucesso: true,
        mensagem: "Login realizado com sucesso!",
        usuario: usuario.usuario,
        tipo: usuario.tipo
    });
});

// ======================================================
// USUÁRIO LOGADO
// ======================================================

app.get("/usuario", exigeLogin, (req, res) => {

    res.json({
        sucesso: true,
        usuario: req.session.usuario
    });
});

// ======================================================
// LOGOUT
// ======================================================

app.post("/logout", (req, res) => {

    req.session.destroy((erro) => {

        if (erro) {
            return res.status(500).json({
                sucesso: false,
                mensagem: "Erro ao sair."
            });
        }

        res.json({
            sucesso: true,
            mensagem: "Sessão encerrada."
        });
    });
});

// ======================================================
// ATENDIMENTO
// ======================================================

app.post(
    "/atendimento",
    exigeTipo("atendimento"),
    (req, res) => {

        const nome = String(req.body.nome || "").trim();
        const cpf = String(req.body.cpf || "").trim();
        const tipo = String(req.body.tipo || "Particular").trim();

        if (!nome) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Informe o nome do paciente."
            });
        }

        const banco = lerBanco();

        const paciente = {
            id: gerarId(),
            nome,
            cpf,
            tipo: tipo === "Convenio" ? "Convenio" : "Particular",
            status: "triagem",
            createdAt: dataAtual()
        };

        banco.pacientes.push(paciente);

        salvarBanco(banco);

        res.json({
            sucesso: true,
            mensagem: "Paciente cadastrado e enviado para a triagem!",
            paciente
        });
    }
);

// ======================================================
// LISTAR PACIENTES
// ======================================================

app.get(
    "/pacientes",
    exigeTipo("atendimento", "triagem", "medico"),
    (req, res) => {

        const banco = lerBanco();

        res.json(banco.pacientes);
    }
);

// ======================================================
// TRIAGEM
// ======================================================

app.post(
    "/triagem",
    exigeTipo("triagem"),
    (req, res) => {

        const nome = String(req.body.nome || "").trim();

        const sintomas = String(
            req.body.sintomas ||
            req.body.sintoma ||
            ""
        ).trim();

        const temp = String(
            req.body.temp ??
            req.body.temperatura ??
            ""
        ).trim();

        const risco = String(
            req.body.risco || "verde"
        ).trim().toLowerCase();

        const alergia = String(
            req.body.alergia || ""
        ).trim();

        const observacao = String(
            req.body.observacao ||
            req.body.obs ||
            ""
        ).trim();

        if (!nome) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Informe o nome do paciente."
            });
        }

        const banco = lerBanco();

        const triagem = {
            id: gerarId(),
            nome,
            sintoma: sintomas,
            temperatura: temp,
            alergia,
            observacao,
            risco,
            status: "aguardando_medico",
            createdAt: dataAtual()
        };

        banco.triagens.push(triagem);

        salvarBanco(banco);

        res.json({
            sucesso: true,
            mensagem: "Triagem registrada com sucesso!",
            triagem
        });
    }
);

// ======================================================
// LISTAR TRIAGENS
// ======================================================

app.get(
    "/triagens",
    exigeTipo("triagem", "medico"),
    (req, res) => {

        const banco = lerBanco();

        const triagens = banco.triagens
            .filter(t =>
                !t.status ||
                t.status === "aguardando_medico"
            )
            .map(t => {

                return {
                    ...t,

                    sintoma:
                        t.sintoma ??
                        t.sintomas ??
                        "",

                    temperatura:
                        t.temperatura ??
                        t.temp ??
                        "",

                    alergia:
                        t.alergia ??
                        "",

                    observacao:
                        t.observacao ??
                        "",

                    risco:
                        t.risco ??
                        "verde"
                };
            });

        res.json(triagens);
    }
);

// ======================================================
// FINALIZAR CONSULTA
// ======================================================

app.post(
    "/consulta",
    exigeTipo("medico"),
    (req, res) => {

        const pacienteId = req.body.pacienteId;

        const pacienteNome = String(
            req.body.paciente || ""
        ).trim();

        const diagnostico = String(
            req.body.diagnostico || ""
        ).trim();

        const medicacao = String(
            req.body.medicacao || ""
        ).trim();

        const obs = String(
            req.body.obs || ""
        ).trim();

        if (!pacienteNome) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Selecione um paciente."
            });
        }

        if (!diagnostico) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Informe o diagnóstico."
            });
        }

        const banco = lerBanco();

        // ------------------------------------------
        // REGISTRA CONSULTA
        // ------------------------------------------

        const consulta = {
            id: gerarId(),
            paciente: pacienteNome,
            diagnostico,
            medicacao,
            obs,
            createdAt: dataAtual()
        };

        banco.consultas.push(consulta);

        // ------------------------------------------
        // MARCA TRIAGEM COMO ATENDIDA
        // ------------------------------------------

        let triagemEncontrada = null;

        if (pacienteId) {
            triagemEncontrada = banco.triagens.find(
                t => String(t.id) === String(pacienteId)
            );
        }

        if (!triagemEncontrada) {
            triagemEncontrada = banco.triagens.find(
                t =>
                    String(t.nome || "").trim().toLowerCase() ===
                    pacienteNome.toLowerCase() &&
                    (!t.status ||
                        t.status === "aguardando_medico")
            );
        }

        if (triagemEncontrada) {
            triagemEncontrada.status = "atendido";
        }

        // ------------------------------------------
        // MARCA PACIENTE COMO ATENDIDO
        // ------------------------------------------

        const paciente = banco.pacientes.find(
            p =>
                String(p.id) === String(pacienteId) ||
                String(p.nome || "").trim().toLowerCase() ===
                pacienteNome.toLowerCase()
        );

        if (paciente) {
            paciente.status = "atendido";
        }

        salvarBanco(banco);

        res.json({
            sucesso: true,
            mensagem: "Consulta finalizada com sucesso!",
            consulta
        });
    }
);

// ======================================================
// LISTA DE MEDICAÇÕES
// ======================================================

app.get(
    "/lista-medicacoes",
    exigeTipo("medico"),
    (req, res) => {

        const medicacoes = [
            "Soro fisiológico",
            "Dipirona",
            "Paracetamol",
            "Omeprazol",
            "Amoxicilina",
            "Azitromicina",
            "Ibuprofeno",
            "Nenhuma"
        ];

        res.json(medicacoes);
    }
);

// ======================================================
// MEDICAÇÕES PRESCRITAS
// ======================================================

app.get(
    "/medicacoes",
    exigeLogin,
    (req, res) => {

        const banco = lerBanco();

        const lista = banco.consultas
            .filter(c =>
                c.medicacao &&
                String(c.medicacao).trim() !== ""
            )
            .reverse();

        res.json(lista);
    }
);

// ======================================================
// ALTA
// ======================================================

app.post(
    "/alta",
    exigeTipo("medico"),
    (req, res) => {

        const pacienteId = req.body.pacienteId;
        const nome = String(req.body.nome || "").trim();

        const banco = lerBanco();

        let paciente = null;

        if (pacienteId) {
            paciente = banco.pacientes.find(
                p => String(p.id) === String(pacienteId)
            );
        }

        if (!paciente && nome) {
            paciente = banco.pacientes.find(
                p =>
                    String(p.nome || "").trim().toLowerCase() ===
                    nome.toLowerCase()
            );
        }

        if (!paciente) {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Paciente não encontrado."
            });
        }

        paciente.status = "alta";
        paciente.altaAt = dataAtual();

        salvarBanco(banco);

        res.json({
            sucesso: true,
            mensagem: "Alta registrada com sucesso!",
            paciente
        });
    }
);

// ======================================================
// CHAMADA DA TV
// ======================================================

app.post(
    "/tv/chamar",
    exigeTipo("medico"),
    (req, res) => {

        const localTipo = String(
            req.body.localTipo || "CONSULTÓRIO"
        ).trim();

        const localNumero = String(
            req.body.localNumero || "01"
        ).trim();

        const paciente = String(
            req.body.paciente || ""
        ).trim();

        if (!paciente) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Informe o paciente."
            });
        }

        const banco = lerBanco();

        const chamada = {
            id: String(Date.now()),
            localTipo,
            localNumero,
            paciente,
            hora: horaAtual()
        };

        banco.tv_chamada = chamada;

        if (!Array.isArray(banco.tv_historico)) {
            banco.tv_historico = [];
        }

        banco.tv_historico.unshift(chamada);

        // Mantém o histórico sem deixar o arquivo crescer indefinidamente
        banco.tv_historico = banco.tv_historico.slice(0, 100);

        salvarBanco(banco);

        res.json({
            sucesso: true,
            mensagem:
                `Paciente ${paciente} chamado para ${localTipo} ${localNumero}.`,
            chamada
        });
    }
);

// ======================================================
// TV ATUAL
// ======================================================

app.get("/tv/atual", (req, res) => {

    const banco = lerBanco();

    res.json(
        banco.tv_chamada || null
    );
});

// ======================================================
// HISTÓRICO DA TV
// ======================================================

app.get(
    "/tv/historico",
    exigeLogin,
    (req, res) => {

        const banco = lerBanco();

        res.json(
            banco.tv_historico || []
        );
    }
);

// ======================================================
// LIMPAR CHAMADA ATUAL
// ======================================================

app.post(
    "/tv/limpar",
    exigeTipo("medico"),
    (req, res) => {

        const banco = lerBanco();

        banco.tv_chamada = null;

        salvarBanco(banco);

        res.json({
            sucesso: true
        });
    }
);

// ======================================================
// ARQUIVOS DO FRONTEND
// ======================================================

app.use(express.static(FRONTEND));

// ======================================================
// ROTAS DAS PÁGINAS
// ======================================================

app.get("/login.html", (req, res) => {
    res.sendFile(path.join(FRONTEND, "login.html"));
});

app.get("/atendimento.html", (req, res) => {
    res.sendFile(path.join(FRONTEND, "atendimento.html"));
});

app.get("/triagem.html", (req, res) => {
    res.sendFile(path.join(FRONTEND, "triagem.html"));
});

app.get("/medico.html", (req, res) => {
    res.sendFile(path.join(FRONTEND, "medico.html"));
});

app.get("/medicacoes.html", (req, res) => {
    res.sendFile(path.join(FRONTEND, "medicacoes.html"));
});

app.get("/alta.html", (req, res) => {
    res.sendFile(path.join(FRONTEND, "alta.html"));
});

app.get("/tv.html", (req, res) => {
    res.sendFile(path.join(FRONTEND, "tv.html"));
});

// ======================================================
// ERRO 404
// ======================================================

app.use((req, res) => {

    res.status(404).json({
        sucesso: false,
        mensagem: "Rota não encontrada."
    });
});

// ======================================================
// INICIAR SERVIDOR
// ======================================================

app.listen(PORT, () => {

    console.log("");
    console.log("========================================");
    console.log("       SAÚDE INTEGRA");
    console.log("========================================");
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`http://localhost:${PORT}`);
    console.log("========================================");
    console.log("");
});
