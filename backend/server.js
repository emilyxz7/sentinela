const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();

const PORT = 3000;

// ===============================
// CONFIGURAÇÕES
// ===============================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Pasta frontend
const FRONTEND_DIR = path.join(__dirname, "../frontend");

app.use(express.static(FRONTEND_DIR));

// Banco de dados
const DB_FILE = path.join(__dirname, "db.json");

// ===============================
// BANCO DE DADOS
// ===============================

function readDB() {

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
            tv_chamada: null,
            tv_historico: []
        };

        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(bancoInicial, null, 2)
        );

        return bancoInicial;
    }

    const db = JSON.parse(
        fs.readFileSync(DB_FILE, "utf8")
    );

    if (!db.usuarios) db.usuarios = [];
    if (!db.pacientes) db.pacientes = [];
    if (!db.triagens) db.triagens = [];
    if (!db.consultas) db.consultas = [];
    if (!db.tv_historico) db.tv_historico = [];
    if (!db.tv_chamada) db.tv_chamada = null;

    // Se não houver usuários, cria os usuários padrão
    if (db.usuarios.length === 0) {

        db.usuarios = [
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
        ];

        writeDB(db);
    }

    return db;
}

function writeDB(data) {

    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(data, null, 2)
    );
}

// ===============================
// PÁGINA INICIAL
// ===============================

app.get("/", (req, res) => {

    res.sendFile(
        path.join(FRONTEND_DIR, "index.html")
    );

});

// ===============================
// LOGIN
// ===============================

app.post("/login", (req, res) => {

    const db = readDB();

    const usuario = req.body.usuario;
    const senha = req.body.senha;

    const user = db.usuarios.find(u =>
        u.usuario === usuario &&
        u.senha === senha
    );

    if (!user) {

        return res.status(401).json({
            erro: "Usuário ou senha inválidos"
        });

    }

    res.json({
        tipo: user.tipo
    });

});

// ===============================
// ATENDIMENTO
// ===============================

app.post("/atendimento", (req, res) => {

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

    writeDB(db);

    res.json(paciente);

});

// ===============================
// LISTAR PACIENTES
// ===============================

app.get("/pacientes", (req, res) => {

    const db = readDB();

    res.json(db.pacientes);

});

// ===============================
// TRIAGEM
// ===============================

app.post("/triagem", (req, res) => {

    const db = readDB();

    let risco = req.body.risco;

    const temperatura = Number(
        req.body.temperatura
    );

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

        temperatura: temperatura,

        alergia: req.body.alergia,

        observacao: req.body.observacao,

        risco: risco,

        status: "aguardando_medico",

        createdAt: new Date().toISOString()

    };

    db.triagens.push(triagem);

    writeDB(db);

    res.json(triagem);

});

// ===============================
// LISTAR TRIAGENS
// ===============================

app.get("/triagens", (req, res) => {

    const db = readDB();

    res.json(
        db.triagens.filter(
            t => t.status === "aguardando_medico"
        )
    );

});

// ===============================
// TV - CHAMAR PACIENTE
// ===============================

app.post("/tv/chamar", (req, res) => {

    const db = readDB();

    const chamada = {

        id: Date.now().toString(),

        localTipo: req.body.localTipo,

        localNumero: req.body.localNumero,

        paciente: req.body.paciente,

        hora: new Date().toLocaleTimeString(
            "pt-BR",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        )

    };

    db.tv_chamada = chamada;

    db.tv_historico.unshift(chamada);

    if (db.tv_historico.length > 5) {

        db.tv_historico.pop();

    }

    writeDB(db);

    res.json(chamada);

});

// ===============================
// TV - CONSULTAR CHAMADA
// ===============================

app.get("/tv/chamada", (req, res) => {

    const db = readDB();

    res.json({

        chamada: db.tv_chamada,

        historico: db.tv_historico

    });

});

// ===============================
// MEDICAÇÕES DISPONÍVEIS
// ===============================

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

// ===============================
// CONSULTA MÉDICA
// ===============================

app.post("/consulta", (req, res) => {

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

    writeDB(db);

    res.json(consulta);

});

// ===============================
// MEDICAÇÕES PRESCRITAS
// ===============================

app.get("/medicacoes", (req, res) => {

    const db = readDB();

    res.json(db.consultas);

});

// ===============================
// SERVIDOR
// ===============================

app.listen(PORT, () => {

    console.log("");
    console.log("=================================");
    console.log("🏥 SAÚDE INTEGRADA");
    console.log("=================================");
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