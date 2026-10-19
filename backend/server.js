
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// ======================================================
// CONFIGURAÇÃO DE PASTAS
// ======================================================

const DB_FILE = path.join(__dirname, "db.json");

const possiveisPastasFrontend = [
    path.join(__dirname, "../frontend"),
    path.join(__dirname, "frontend")
];

const FRONTEND_DIR = possiveisPastasFrontend.find((pasta) =>
    fs.existsSync(path.join(pasta, "index.html"))
) || possiveisPastasFrontend[0];

// ======================================================
// MIDDLEWARES
// ======================================================

app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(cors({
    origin: true,
    credentials: true
}));

// ======================================================
// BANCO DE DADOS JSON
// ======================================================

function criarBancoSeNaoExistir() {
    if (!fs.existsSync(DB_FILE)) {
        const bancoInicial = {
            usuarios: [
                {
                    usuario: "atendimento",
                    senha: "123",
                    tipo: "atendimento"
                },
                {
                    usuario: "triagem",
                    senha: "123",
                    tipo: "triagem"
                },
                {
                    usuario: "medico",
                    senha: "123",
                    tipo: "medico"
                }
            ],
            pacientes: [],
            triagens: [],
            consultas: [],
            tv_chamada: {},
            tv_historico: []
        };

        salvarBanco(bancoInicial);

        console.log("Banco de dados inicial criado.");
    }
}

function lerBanco() {
    criarBancoSeNaoExistir();

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

    if (
        !banco.tv_chamada ||
        typeof banco.tv_chamada !== "object" ||
        Array.isArray(banco.tv_chamada)
    ) {
        banco.tv_chamada = {};
    }

    return banco;
}

function salvarBanco(banco) {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(banco, null, 2),
        "utf8"
    );
}

function gerarId() {
    return Date.now().toString() +
        crypto.randomBytes(3).toString("hex");
}

function texto(valor) {
    return typeof valor === "string" ||
        typeof valor === "number"
        ? String(valor).trim()
        : "";
}

function nomeIgual(a, b) {
    return texto(a).toLowerCase() === texto(b).toLowerCase();
}

// ======================================================
// SESSÕES DE LOGIN
// ======================================================

// As sessões ficam na memória. Se o servidor reiniciar,
// os usuários precisarão entrar novamente.
const sessoes = new Map();

function obterCookies(req) {
    const cookies = {};
    const cabecalho = req.headers.cookie || "";

    cabecalho.split(";").forEach((item) => {
        const posicao = item.indexOf("=");

        if (posicao === -1) return;

        const nome = item.slice(0, posicao).trim();
        const valor = item.slice(posicao + 1).trim();

        try {
            cookies[nome] = decodeURIComponent(valor);
        } catch {
            cookies[nome] = valor;
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

    if (!token) return null;

    return sessoes.get(token) || null;
}

function definirCookieSessao(res, token) {
    const producao = process.env.NODE_ENV === "production";

    res.setHeader(
        "Set-Cookie",
        "saude_integra_sessao=" + token +
        "; Path=/; HttpOnly; SameSite=Lax" +
        (producao ? "; Secure" : "")
    );
}

function limparCookieSessao(res) {
    const producao = process.env.NODE_ENV === "production";

    res.setHeader(
        "Set-Cookie",
        "saude_integra_sessao=; Path=/; HttpOnly; " +
        "Max-Age=0; SameSite=Lax" +
        (producao ? "; Secure" : "")
    );
}

function exigirLogin(req, res, proximo) {
    const usuario = obterUsuarioLogado(req);

    if (!usuario) {
        return res.status(401).json({
            sucesso: false,
            mensagem: "Você precisa fazer login para continuar."
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
                mensagem: "Sua sessão expirou. Entre novamente."
            });
        }

        if (!tiposPermitidos.includes(usuario.tipo)) {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Você não tem permissão para realizar esta ação."
            });
        }

        req.usuarioLogado = usuario;
        proximo();
    };
}

// ======================================================
// PÁGINAS DO SITE
// ======================================================

app.get("/", (req, res) => {
    const arquivo = path.join(FRONTEND_DIR, "index.html");

    if (fs.existsSync(arquivo)) {
        return res.sendFile(arquivo);
    }

    res.status(404).send(
        "Página inicial não encontrada. Confira a pasta frontend."
    );
});

app.use(express.static(FRONTEND_DIR));

// ======================================================
// LOGIN
// ======================================================

app.post("/login", (req, res) => {
    const usuario = texto(req.body.usuario);
    const senha = req.body.senha;

    if (!usuario || !senha) {
        return res.status(400).json({
            sucesso: false,
            mensagem: "Informe o usuário e a senha."
        });
    }

    const banco = lerBanco();

    const encontrado = banco.usuarios.find((item) =>
        texto(item.usuario) === usuario &&
        String(item.senha) === String(senha)
    );

    if (!encontrado) {
        return res.status(401).json({
            sucesso: false,
            mensagem: "Usuário ou senha inválidos."
        });
    }

    const token = criarSessao(encontrado);

    definirCookieSessao(res, token);

    res.json({
        sucesso: true,
        mensagem: "Login realizado com sucesso.",
        usuario: encontrado.usuario,
        tipo: encontrado.tipo
    });
});

// ======================================================
// CONSULTAR SESSÃO ATUAL
// ======================================================

app.get("/sessao", exigirLogin, (req, res) => {
    res.json({
        sucesso: true,
        usuario: req.usuarioLogado.usuario,
        tipo: req.usuarioLogado.tipo
    });
});

// ======================================================
// SAIR DO SISTEMA
// ======================================================

app.post("/logout", (req, res) => {
    const cookies = obterCookies(req);
    const token = cookies.saude_integra_sessao;

    if (token) {
        sessoes.delete(token);
    }

    limparCookieSessao(res);

    res.json({
        sucesso: true,
        mensagem: "Sessão encerrada."
    });
});

// ======================================================
// CADASTRAR PACIENTE
// Perfil: atendimento
// ======================================================

app.post(
    "/atendimento",
    exigirTipo("atendimento"),
    (req, res) => {
        const nome = texto(req.body.nome);
        const cpf = texto(req.body.cpf);
        const tipo = texto(req.body.tipo) || "Particular";

        if (!nome) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Informe o nome do paciente."
            });
        }

        if (!["Particular", "Convenio"].includes(tipo)) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Selecione um tipo de atendimento válido."
            });
        }

        const banco = lerBanco();

        if (cpf) {
            const cpfLimpo = cpf.replace(/\D/g, "");

            const cpfExistente = banco.pacientes.some((item) =>
                item.cpf &&
                String(item.cpf).replace(/\D/g, "") === cpfLimpo
            );

            if (cpfExistente) {
                return res.status(409).json({
                    sucesso: false,
                    mensagem: "Já existe um paciente cadastrado com esse CPF."
                });
            }
        }

        const paciente = {
            id: gerarId(),
            nome,
            cpf,
            tipo,
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

// ======================================================
// LISTAR PACIENTES
// ======================================================

app.get(
    "/pacientes",
    exigirLogin,
    (req, res) => {
        const banco = lerBanco();
        res.json(banco.pacientes);
    }
);

// ======================================================
// REGISTRAR TRIAGEM
// Perfil: triagem
// ======================================================

app.post(
    "/triagem",
    exigirTipo("triagem"),
    (req, res) => {
        const pacienteId = texto(req.body.pacienteId);
        const nome = texto(req.body.nome);
        const sintoma = texto(req.body.sintoma || req.body.sintomas);
        const temperatura = req.body.temperatura ?? req.body.temp ?? "";
        const alergia = texto(req.body.alergia);
        const observacao = texto(req.body.observacao);
        const risco = texto(req.body.risco).toLowerCase() || "verde";

        if (!nome) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Informe o nome do paciente."
            });
        }

        if (!["verde", "amarelo", "vermelho"].includes(risco)) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Classificação de risco inválida."
            });
        }

        const banco = lerBanco();

        let paciente = null;

        if (pacienteId) {
            paciente = banco.pacientes.find((item) =>
                String(item.id) === pacienteId
            );

            if (!paciente) {
                return res.status(404).json({
                    sucesso: false,
                    mensagem: "O ID informado não corresponde a um paciente cadastrado."
                });
            }
        } else {
            paciente = banco.pacientes.find((item) =>
                nomeIgual(item.nome, nome)
            );
        }

        const novaTriagem = {
            id: gerarId(),
            pacienteId: paciente ? paciente.id : null,
            nome: paciente ? paciente.nome : nome,
            sintoma,
            sintomas: sintoma,
            temperatura,
            temp: temperatura,
            alergia,
            observacao,
            risco,
            status: "aguardando_medico",
            createdAt: new Date().toISOString()
        };

        banco.triagens.push(novaTriagem);

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

// ======================================================
// LISTAR TRIAGENS PENDENTES
// Perfil: médico
// ======================================================

app.get(
    "/triagens",
    exigirTipo("medico"),
    (req, res) => {
        const banco = lerBanco();

        const resultado = banco.triagens
            .filter((triagem) =>
                !triagem.status ||
                triagem.status === "aguardando_medico" ||
                triagem.status === "triagem"
            )
            .map((triagem) => ({
                ...triagem,
                nome: triagem.nome || triagem.paciente || "Sem nome",
                sintoma: triagem.sintoma ||
                    triagem.sintomas ||
                    "Não informado",
                sintomas: triagem.sintomas ||
                    triagem.sintoma ||
                    "Não informado",
                temperatura: triagem.temperatura ??
                    triagem.temp ??
                    "Não informada",
                temp: triagem.temp ??
                    triagem.temperatura ??
                    "Não informada",
                alergia: triagem.alergia || "Não informado",
                observacao: triagem.observacao || "Nenhuma"
            }));

        res.json(resultado);
    }
);

// ======================================================
// FINALIZAR CONSULTA
// Perfil: médico
// ======================================================

app.post(
    "/consulta",
    exigirTipo("medico"),
    (req, res) => {
        const pacienteId = texto(req.body.pacienteId);
        const triagemId = texto(req.body.triagemId);
        const pacienteNome = texto(req.body.paciente || req.body.nome);
        const diagnostico = texto(req.body.diagnostico);
        const medicacao = texto(req.body.medicacao);
        const obs = texto(req.body.obs);

        if (!pacienteNome) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Selecione um paciente."
            });
        }

        const banco = lerBanco();

        let triagem = null;

        if (triagemId) {
            triagem = banco.triagens.find((item) =>
                String(item.id) === triagemId
            );
        }

        if (!triagem) {
            triagem = banco.triagens.find((item) =>
                nomeIgual(item.nome || item.paciente, pacienteNome) &&
                (
                    item.status === "aguardando_medico" ||
                    item.status === "triagem" ||
                    !item.status
                )
            );
        }

        const paciente = banco.pacientes.find((item) => {
            if (pacienteId && String(item.id) === pacienteId) {
                return true;
            }

            return nomeIgual(item.nome, pacienteNome);
        });

        const novaConsulta = {
            id: gerarId(),
            pacienteId: paciente ? paciente.id : (pacienteId || null),
            triagemId: triagem ? triagem.id : (triagemId || null),
            paciente: paciente ? paciente.nome : pacienteNome,
            diagnostico,
            medicacao,
            obs,
            createdAt: new Date().toISOString()
        };

        banco.consultas.push(novaConsulta);

        if (triagem) {
            triagem.status = "atendido";
            triagem.atendidoEm = new Date().toISOString();
        }

        if (paciente) {
            paciente.status = "consulta_finalizada";
        }

        salvarBanco(banco);

        res.status(201).json({
            sucesso: true,
            mensagem: "Consulta finalizada com sucesso.",
            consulta: novaConsulta
        });
    }
);

// ======================================================
// LISTAR MEDICAÇÕES PRESCRITAS
// ======================================================

app.get(
    "/medicacoes",
    exigirLogin,
    (req, res) => {
        const banco = lerBanco();

        const medicacoes = banco.consultas
            .filter((consulta) =>
                consulta.medicacao &&
                texto(consulta.medicacao)
            )
            .map((consulta) => ({
                id: consulta.id,
                paciente: consulta.paciente || "Não informado",
                diagnostico: consulta.diagnostico || "Não informado",
                medicacao: consulta.medicacao,
                obs: consulta.obs || "Nenhuma",
                createdAt: consulta.createdAt
            }));

        res.json(medicacoes);
    }
);

// ======================================================
// LISTA DE MEDICAÇÕES PARA O MÉDICO
// ======================================================

app.get(
    "/lista-medicacoes",
    exigirTipo("medico"),
    (req, res) => {
        const banco = lerBanco();

        const lista = [
            "Dipirona",
            "Paracetamol",
            "Amoxicilina",
            "Omeprazol",
            "Soro fisiológico"
        ];

        banco.consultas.forEach((consulta) => {
            const medicacao = texto(consulta.medicacao);

            if (medicacao && !lista.includes(medicacao)) {
                lista.push(medicacao);
            }
        });

        res.json(lista);
    }
);

// ======================================================
// REGISTRAR ALTA MÉDICA
// Perfil: médico
// Aceita "orientacoes" e "observacao"
// ======================================================

app.post(
    "/alta",
    exigirTipo("medico"),
    (req, res) => {
        const pacienteId = texto(req.body.pacienteId);
        const nomePaciente = texto(req.body.paciente || req.body.nome);
        const orientacoes = texto(
            req.body.orientacoes || req.body.observacao
        );

        if (!pacienteId && !nomePaciente) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Informe o paciente."
            });
        }

        const banco = lerBanco();

        const paciente = banco.pacientes.find((item) => {
            if (
                pacienteId &&
                String(item.id) === pacienteId
            ) {
                return true;
            }

            return nomePaciente && nomeIgual(item.nome, nomePaciente);
        });

        if (!paciente) {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Paciente não encontrado no cadastro."
            });
        }

        paciente.status = "alta";
        paciente.altaEm = new Date().toISOString();
        paciente.observacaoAlta = orientacoes;

        // Atualiza também a triagem correspondente, se houver.
        const triagem = banco.triagens.find((item) =>
            (
                item.pacienteId &&
                String(item.pacienteId) === String(paciente.id)
            ) ||
            nomeIgual(item.nome || item.paciente, paciente.nome)
        );

        if (triagem) {
            triagem.status = "alta";
        }

        salvarBanco(banco);

        res.json({
            sucesso: true,
            mensagem: "Alta médica registrada com sucesso.",
            paciente
        });
    }
);

// ======================================================
// CHAMAR PACIENTE NA TV
// Perfil: médico
// ======================================================

app.post(
    "/tv/chamar",
    exigirTipo("medico"),
    (req, res) => {
        const localTipo = texto(req.body.localTipo) || "CONSULTÓRIO";
        const localNumero = texto(req.body.localNumero) || "01";
        const paciente = texto(req.body.paciente || req.body.nome);

        if (!paciente) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Informe o nome do paciente."
            });
        }

        const banco = lerBanco();

        const chamada = {
            id: gerarId(),
            localTipo,
            localNumero,
            paciente,
            hora: new Date().toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit"
            }),
            createdAt: new Date().toISOString()
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

// ======================================================
// CONSULTAR CHAMADA ATUAL
// A TV não exige login para exibir a chamada.
// ======================================================

app.get("/tv/atual", (req, res) => {
    const banco = lerBanco();

    res.setHeader("Cache-Control", "no-store");

    res.json(banco.tv_chamada || {});
});

// ======================================================
// HISTÓRICO DAS CHAMADAS
// ======================================================

app.get(
    "/tv/historico",
    exigirLogin,
    (req, res) => {
        const banco = lerBanco();
        res.json(banco.tv_historico);
    }
);

// ======================================================
// TESTAR SE O SERVIDOR ESTÁ ONLINE
// ======================================================

app.get("/status", (req, res) => {
    res.json({
        sucesso: true,
        sistema: "Projeto-Sentinela",
        status: "online",
        data: new Date().toISOString()
    });
});

// ======================================================
// ERRO DE JSON INVÁLIDO
// ======================================================

app.use((erro, req, res, proximo) => {
    if (
        erro instanceof SyntaxError &&
        erro.status === 400 &&
        "body" in erro
    ) {
        return res.status(400).json({
            sucesso: false,
            mensagem: "O conteúdo enviado não é um JSON válido."
        });
    }

    proximo(erro);
});

// ======================================================
// ROTA NÃO ENCONTRADA
// ======================================================

app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({
            sucesso: false,
            mensagem: "Rota da API não encontrada."
        });
    }

    res.status(404).json({
        sucesso: false,
        mensagem: "Página ou rota não encontrada."
    });
});

// ======================================================
// TRATAMENTO DE ERROS
// ======================================================

app.use((erro, req, res, proximo) => {
    console.error("Erro interno:", erro);

    if (res.headersSent) {
        return proximo(erro);
    }

    res.status(500).json({
        sucesso: false,
        mensagem: "Ocorreu um erro interno no servidor."
    });
});

// ======================================================
// INICIAR SERVIDOR
// ======================================================

app.listen(PORT, "0.0.0.0", () => {
    console.log("======================================");
    console.log("      PROJETO-SENTINELA ONLINE");
    console.log("======================================");
    console.log("Porta:", PORT);
    console.log("Frontend:", FRONTEND_DIR);
    console.log("Banco:", DB_FILE);
});
