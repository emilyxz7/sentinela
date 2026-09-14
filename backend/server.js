const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = 3000;

const FRONTEND_DIR = path.join(__dirname, "../frontend");
const DB_FILE = path.join(__dirname, "db.json");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(FRONTEND_DIR));


// ======================================================
// BANCO DE DADOS
// ======================================================

function criarBancoInicial() {
    return {
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

        tv_chamada: null,
        tv_historico: []
    };
}


function readDB() {

    if (!fs.existsSync(DB_FILE)) {

        const banco = criarBancoInicial();

        writeDB(banco);

        return banco;
    }

    try {

        const db = JSON.parse(
            fs.readFileSync(DB_FILE, "utf8")
        );

        db.usuarios ||= [];
        db.pacientes ||= [];
        db.triagens ||= [];
        db.consultas ||= [];
        db.tv_historico ||= [];

        if (!("tv_chamada" in db)) {
            db.tv_chamada = null;
        }

        if (db.usuarios.length === 0) {
            db.usuarios = criarBancoInicial().usuarios;
            writeDB(db);
        }

        return db;

    } catch (erro) {

        console.error("Erro no banco:", erro);

        const banco = criarBancoInicial();

        writeDB(banco);

        return banco;
    }
}


function writeDB(data) {

    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(data, null, 2),
        "utf8"
    );
}


// ======================================================
// PÁGINA INICIAL
// ======================================================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(FRONTEND_DIR, "index.html")
    );

});


// ======================================================
// LOGIN
// ======================================================

app.post("/login", (req, res) => {

    const db = readDB();

    const usuario = String(req.body.usuario || "").trim();
    const senha = String(req.body.senha || "");

    const user = db.usuarios.find(
        u =>
            u.usuario === usuario &&
            u.senha === senha
    );

    if (!user) {

        return res.status(401).json({
            erro: "Usuário ou senha inválidos"
        });
    }

    res.json({
        sucesso: true,
        tipo: user.tipo
    });
});


// ======================================================
// ATENDIMENTO - CADASTRAR PACIENTE
// ======================================================

app.post("/atendimento", (req, res) => {

    const db = readDB();

    const nome = String(req.body.nome || "").trim();
    const cpf = String(req.body.cpf || "").trim();
    const tipo = String(req.body.tipo || "Particular").trim();

    if (!nome) {

        return res.status(400).json({
            erro: "Nome do paciente é obrigatório"
        });
    }

    const paciente = {

        id: Date.now().toString(),

        nome,

        cpf,

        tipo,

        status: "triagem",

        createdAt: new Date().toISOString()
    };

    db.pacientes.push(paciente);

    writeDB(db);

    res.status(201).json(paciente);
});


// ======================================================
// LISTAR PACIENTES
// ======================================================

app.get("/pacientes", (req, res) => {

    const db = readDB();

    res.json(db.pacientes);
});


// ======================================================
// TRIAGEM
// ======================================================

app.post("/triagem", (req, res) => {

    const db = readDB();

    const pacienteId = String(
        req.body.pacienteId || ""
    );

    const nome = String(
        req.body.nome || ""
    ).trim();

    const sintoma = String(
        req.body.sintoma || ""
    );

    const temperatura = Number(
        req.body.temperatura
    );

    const alergia = String(
        req.body.alergia || ""
    );

    const observacao = String(
        req.body.observacao || ""
    );

    let risco = String(
        req.body.risco || ""
    );


    // --------------------------------------------
    // CLASSIFICAÇÃO AUTOMÁTICA DE SEGURANÇA
    // --------------------------------------------

    const sintomasVermelhos = [
        "infarto",
        "avc",
        "convulsao",
        "hemorragia",
        "falta_ar_grave"
    ];

    const sintomasAmarelos = [
        "febre",
        "vomito",
        "diarreia",
        "falta_ar_moderada"
    ];


    if (temperatura >= 39) {

        risco = "vermelho";

    } else if (
        sintomasVermelhos.includes(sintoma)
    ) {

        risco = "vermelho";

    } else if (
        temperatura >= 38 ||
        sintomasAmarelos.includes(sintoma)
    ) {

        risco = "amarelo";

    } else {

        risco = "verde";
    }


    // --------------------------------------------
    // LOCALIZA O PACIENTE
    // --------------------------------------------

    let paciente = null;

    if (pacienteId) {

        paciente = db.pacientes.find(
            p => p.id === pacienteId
        );
    }

    if (!paciente && nome) {

        paciente = db.pacientes.find(
            p =>
                p.nome.toLowerCase() ===
                nome.toLowerCase() &&
                p.status === "triagem"
        );
    }


    if (!paciente) {

        return res.status(404).json({
            erro: "Paciente não encontrado na fila."
        });
    }


    // --------------------------------------------
    // EVITA TRIAGEM DUPLICADA
    // --------------------------------------------

    const triagemExistente =
        db.triagens.find(
            t =>
                t.pacienteId === paciente.id &&
                t.status === "aguardando_medico"
        );

    if (triagemExistente) {

        return res.status(409).json({
            erro: "Este paciente já está aguardando o médico."
        });
    }


    const triagem = {

        id: Date.now().toString(),

        pacienteId: paciente.id,

        nome: paciente.nome,

        sintoma,

        temperatura:
            Number.isFinite(temperatura)
                ? temperatura
                : null,

        alergia,

        observacao,

        risco,

        status: "aguardando_medico",

        createdAt: new Date().toISOString()
    };


    db.triagens.push(triagem);

    paciente.status = "aguardando_medico";

    writeDB(db);

    res.status(201).json(triagem);
});


// ======================================================
// LISTAR TRIAGENS PARA O MÉDICO
// ======================================================

app.get("/triagens", (req, res) => {

    const db = readDB();

    const lista = db.triagens
        .filter(
            t =>
                t.status ===
                "aguardando_medico"
        )
        .sort(
            (a, b) =>
                new Date(a.createdAt) -
                new Date(b.createdAt)
        );

    res.json(lista);
});


// ======================================================
// CHAMAR PACIENTE NA TV
// ======================================================

app.post("/tv/chamar", (req, res) => {

    const db = readDB();

    const localTipo =
        String(
            req.body.localTipo || "GUICHÊ"
        ).toUpperCase();

    const localNumero =
        String(
            req.body.localNumero || "01"
        );

    const paciente =
        String(
            req.body.paciente || ""
        ).trim();


    if (!paciente) {

        return res.status(400).json({
            erro: "Paciente não informado"
        });
    }


    const chamada = {

        id: Date.now().toString(),

        localTipo,

        localNumero,

        paciente,

        hora: new Date().toLocaleTimeString(
            "pt-BR",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        ),

        createdAt:
            new Date().toISOString()
    };


    db.tv_chamada = chamada;

    db.tv_historico.unshift(chamada);

    db.tv_historico =
        db.tv_historico.slice(0, 5);


    writeDB(db);

    res.json(chamada);
});


// ======================================================
// CONSULTAR TV
// ======================================================

app.get("/tv/chamada", (req, res) => {

    const db = readDB();

    res.json({

        chamada: db.tv_chamada,

        historico:
            db.tv_historico || []
    });
});


// ======================================================
// MEDICAÇÕES DISPONÍVEIS
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
// CONSULTA MÉDICA
// ======================================================

app.post("/consulta", (req, res) => {

    const db = readDB();

    const pacienteId =
        String(req.body.pacienteId || "");

    const paciente =
        String(req.body.paciente || "").trim();

    const diagnostico =
        String(req.body.diagnostico || "").trim();

    const medicacao =
        String(req.body.medicacao || "").trim();

    const obs =
        String(req.body.obs || "").trim();


    if (!paciente) {

        return res.status(400).json({
            erro: "Paciente não informado"
        });
    }


    if (!diagnostico) {

        return res.status(400).json({
            erro: "Informe o diagnóstico"
        });
    }


    if (!medicacao) {

        return res.status(400).json({
            erro: "Selecione uma medicação"
        });
    }


    const consulta = {

        id: Date.now().toString(),

        pacienteId,

        paciente,

        diagnostico,

        medicacao,

        obs,

        createdAt:
            new Date().toISOString()
    };


    db.consultas.push(consulta);


    // --------------------------------------------
    // FINALIZA A TRIAGEM
    // --------------------------------------------

    if (pacienteId) {

        const triagem =
            db.triagens.find(
                t =>
                    t.pacienteId === pacienteId &&
                    t.status === "aguardando_medico"
            );

        if (triagem) {
            triagem.status = "atendido";
        }


        const pacienteBanco =
            db.pacientes.find(
                p =>
                    p.id === pacienteId
            );

        if (pacienteBanco) {

            pacienteBanco.status =
                "atendido";
        }
    }


    writeDB(db);

    res.status(201).json(consulta);
});


// ======================================================
// LISTAR CONSULTAS / MEDICAÇÕES
// ======================================================

app.get("/medicacoes", (req, res) => {

    const db = readDB();

    res.json(
        db.consultas
            .slice()
            .reverse()
    );
});


// ======================================================
// STATUS DO SISTEMA
// ======================================================

app.get("/status", (req, res) => {

    res.json({
        sistema: "Saúde Integra",
        online: true,
        horario: new Date().toISOString()
    });
});


// ======================================================
// ERRO 404
// ======================================================

app.use((req, res) => {

    res.status(404).json({
        erro: "Rota não encontrada"
    });
});


// ======================================================
// SERVIDOR
// ======================================================

app.listen(PORT, () => {

    console.log("");
    console.log("====================================");
    console.log("🏥 SAÚDE INTEGRA");
    console.log("====================================");
    console.log(
        `Servidor: http://localhost:${PORT}`
    );
    console.log("");
    console.log("Usuários:");
    console.log("Atendimento: atendimento / 123");
    console.log("Triagem:     triagem / 123");
    console.log("Médico:      medico / 123");
    console.log("");
});
