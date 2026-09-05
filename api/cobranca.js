const crypto = require("crypto");

function base64urlEncode(text) {
    return Buffer.from(text)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

function base64urlDecode(text) {
    text = text
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    while (text.length % 4) {
        text += "=";
    }

    return Buffer.from(text, "base64").toString("utf8");
}

function criarAssinatura(dados, segredo) {
    return crypto
        .createHmac("sha256", segredo)
        .update(dados)
        .digest("base64url");
}

module.exports = async (req, res) => {

    const segredo = process.env.CARNE_SECRET;

    if (!segredo) {
        return res.status(500).json({
            erro: "Chave de segurança não configurada."
        });
    }

    // ==============================
    // CRIAR COBRANÇA
    // ==============================

    if (req.method === "POST") {

        try {

            const dados = req.body;

            if (!dados) {
                return res.status(400).json({
                    erro: "Dados da cobrança não enviados."
                });
            }

            const payload = {
                cliente: dados.cliente || "",
                cpf: dados.cpf || "",
                parcela: dados.parcela || "",
                vencimento: dados.vencimento || "",
                valor: Number(dados.valor || 0),
                multa: Number(dados.multa || 0),
                juros: Number(dados.juros || 0),
                pix: dados.pix || "",
                criadoEm: Date.now()
            };

            const dadosCodificados = base64urlEncode(
                JSON.stringify(payload)
            );

            const assinatura = criarAssinatura(
                dadosCodificados,
                segredo
            );

            const token = dadosCodificados + "." + assinatura;

            return res.status(200).json({
                sucesso: true,
                token: token
            });

        } catch (erro) {

            return res.status(500).json({
                erro: "Erro ao criar cobrança."
            });

        }
    }

    // ==============================
    // VALIDAR COBRANÇA
    // ==============================

    if (req.method === "GET") {

        try {

            const token = req.query.token;

            if (!token) {
                return res.status(400).json({
                    erro: "Token não informado."
                });
            }

            const partes = token.split(".");

            if (partes.length !== 2) {
                return res.status(401).json({
                    erro: "Cobrança inválida."
                });
            }

            const dadosCodificados = partes[0];
            const assinaturaRecebida = partes[1];

            const assinaturaEsperada = criarAssinatura(
                dadosCodificados,
                segredo
            );

            const assinaturaValida = crypto.timingSafeEqual(
                Buffer.from(assinaturaRecebida),
                Buffer.from(assinaturaEsperada)
            );

            if (!assinaturaValida) {
                return res.status(401).json({
                    erro: "Cobrança inválida ou alterada."
                });
            }

            const dados = JSON.parse(
                base64urlDecode(dadosCodificados)
            );

            return res.status(200).json({
                sucesso: true,
                dados: dados
            });

        } catch (erro) {

            return res.status(401).json({
                erro: "Não foi possível validar a cobrança."
            });

        }
    }

    return res.status(405).json({
        erro: "Método não permitido."
    });
};
