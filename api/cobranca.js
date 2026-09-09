const crypto = require("crypto");


/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const CARNE_SECRET =
    process.env.CARNE_SECRET;

const SUPABASE_URL =
    process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY;


/* =========================================================
   BASE64 URL
========================================================= */

function base64urlEncode(text){

    return Buffer.from(text)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

}


function base64urlDecode(text){

    text = text
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    while(text.length % 4){

        text += "=";

    }

    return Buffer.from(
        text,
        "base64"
    ).toString("utf8");

}


/* =========================================================
   ASSINATURA DOS TOKENS ANTIGOS
========================================================= */

function criarAssinatura(
    dados,
    segredo
){

    return crypto
        .createHmac(
            "sha256",
            segredo
        )
        .update(dados)
        .digest("base64url");

}


/* =========================================================
   VERIFICAR CONFIGURAÇÃO SUPABASE
========================================================= */

function supabaseConfigurado(){

    return Boolean(
        SUPABASE_URL &&
        SUPABASE_SERVICE_ROLE_KEY
    );

}


/* =========================================================
   REQUEST SUPABASE
========================================================= */

async function supabaseRequest(
    tabela,
    opcoes = {}
){

    if(!supabaseConfigurado()){

        throw new Error(
            "Supabase não configurado no Vercel."
        );

    }


    const url =
        SUPABASE_URL.replace(/\/$/, "") +
        "/rest/v1/" +
        tabela;


    const headers = {

        "apikey":
            SUPABASE_SERVICE_ROLE_KEY,

        "Authorization":
            "Bearer " +
            SUPABASE_SERVICE_ROLE_KEY,

        "Content-Type":
            "application/json",

        ...(opcoes.headers || {})

    };


    const resposta =
        await fetch(
            url +
            (
                opcoes.query
                    ? "?" + opcoes.query
                    : ""
            ),
            {

                method:
                    opcoes.method || "GET",

                headers,

                body:
                    opcoes.body
                        ? JSON.stringify(
                            opcoes.body
                        )
                        : undefined

            }
        );


    const texto =
        await resposta.text();


    let dados = null;


    if(texto){

        try{

            dados =
                JSON.parse(texto);

        }catch(e){

            dados =
                texto;

        }

    }


    if(!resposta.ok){

        console.error(
            "Erro Supabase:",
            resposta.status,
            dados
        );


        throw new Error(
            (
                dados &&
                dados.message
            )
                ||
                (
                    dados &&
                    dados.error_description
                )
                ||
                "Erro ao consultar o Supabase."
        );

    }


    return dados;

}


/* =========================================================
   GERAR CÓDIGO SEGURO DO CARNÊ
========================================================= */

function gerarCodigoCarne(){

    return crypto
        .randomBytes(24)
        .toString("base64url");

}


/* =========================================================
   BUSCAR CLIENTE
========================================================= */

async function buscarCliente(
    clienteId
){

    const dados =
        await supabaseRequest(
            "clientes",
            {

                query:
                    "id=eq." +
                    encodeURIComponent(
                        clienteId
                    ) +
                    "&select=id,nome,cpf_cnpj,telefone,endereco,observacoes,criado_em" +
                    "&limit=1"

            }
        );


    if(
        !Array.isArray(dados) ||
        !dados.length
    ){

        return null;

    }


    return dados[0];

}


/* =========================================================
   BUSCAR CARNÊ DO CLIENTE
========================================================= */

async function buscarCarnePorCliente(
    clienteId
){

    const dados =
        await supabaseRequest(
            "carnes",
            {

                query:
                    "cliente_id=eq." +
                    encodeURIComponent(
                        clienteId
                    ) +
                    "&ativo=eq.true" +
                    "&select=id,cliente_id,venda_id,codigo_acesso,multa,juros,pix,ativo,criado_em" +
                    "&limit=1"

            }
        );


    if(
        !Array.isArray(dados) ||
        !dados.length
    ){

        return null;

    }


    return dados[0];

}


/* =========================================================
   BUSCAR CARNÊ PELO CÓDIGO
========================================================= */

async function buscarCarnePorCodigo(
    codigo
){

    const dados =
        await supabaseRequest(
            "carnes",
            {

                query:
                    "codigo_acesso=eq." +
                    encodeURIComponent(
                        codigo
                    ) +
                    "&ativo=eq.true" +
                    "&select=id,cliente_id,venda_id,codigo_acesso,multa,juros,pix,ativo,criado_em" +
                    "&limit=1"

            }
        );


    if(
        !Array.isArray(dados) ||
        !dados.length
    ){

        return null;

    }


    return dados[0];

}


/* =========================================================
   BUSCAR VENDAS DO CLIENTE
========================================================= */

async function buscarVendasCliente(
    clienteId
){

    const vendas =
        await supabaseRequest(
            "vendas",
            {

                query:
                    "cliente_id=eq." +
                    encodeURIComponent(
                        clienteId
                    ) +
                    "&select=id,cliente_id,descricao,valor_total,quantidade_parcelas,data_venda,status,observacoes,criado_em" +
                    "&order=data_venda.asc,criado_em.asc"

            }
        );


    if(
        !Array.isArray(vendas)
    ){

        return [];

    }


    return vendas;

}


/* =========================================================
   BUSCAR PARCELAS DAS VENDAS
========================================================= */

async function buscarParcelasVendas(
    vendas
){

    if(
        !vendas ||
        !vendas.length
    ){

        return [];

    }


    const ids =
        vendas.map(
            venda => venda.id
        );


    const listaIds =
        ids.join(",");


    const parcelas =
        await supabaseRequest(
            "parcelas",
            {

                query:
                    "venda_id=in.(" +
                    encodeURIComponent(
                        listaIds
                    ) +
                    ")" +
                    "&select=id,venda_id,numero,valor,vencimento,status,data_pagamento,valor_pago,pix_txid,pix_copia_cola,pix_qrcode,criado_em" +
                    "&order=vencimento.asc,numero.asc"

            }
        );


    if(
        !Array.isArray(parcelas)
    ){

        return [];

    }


    return parcelas;

}


/* =========================================================
   MONTAR CARNÊ DIGITAL
========================================================= */

async function montarCarneDigital(
    carne
){

    if(!carne){

        throw new Error(
            "Carnê não encontrado."
        );

    }


    const cliente =
        await buscarCliente(
            carne.cliente_id
        );


    if(!cliente){

        throw new Error(
            "Cliente do carnê não encontrado."
        );

    }


    const vendas =
        await buscarVendasCliente(
            carne.cliente_id
        );


    const parcelas =
        await buscarParcelasVendas(
            vendas
        );


    const vendasComParcelas =
        vendas.map(
            venda => {

                const parcelasVenda =
                    parcelas.filter(
                        parcela =>
                            parcela.venda_id ===
                            venda.id
                    );


                return {

                    ...venda,

                    parcelas:
                        parcelasVenda

                };

            }
        );


    return {

        sucesso: true,

        carne: {

            id:
                carne.id,

            codigo_acesso:
                carne.codigo_acesso,

            multa:
                Number(
                    carne.multa || 0
                ),

            juros:
                Number(
                    carne.juros || 0
                ),

            pix:
                carne.pix || "",

            ativo:
                carne.ativo,

            criado_em:
                carne.criado_em

        },

        cliente: {

            id:
                cliente.id,

            nome:
                cliente.nome,

            cpf_cnpj:
                cliente.cpf_cnpj,

            telefone:
                cliente.telefone,

            endereco:
                cliente.endereco,

            observacoes:
                cliente.observacoes

        },

        vendas:
            vendasComParcelas,

        parcelas:

            parcelas

    };

}


/* =========================================================
   CRIAR OU REUTILIZAR CARNÊ
========================================================= */

async function criarOuBuscarCarne(
    dados
){

    const clienteId =
        String(
            dados.clienteId || ""
        ).trim();


    if(!clienteId){

        throw new Error(
            "ID do cliente não informado."
        );

    }


    const cliente =
        await buscarCliente(
            clienteId
        );


    if(!cliente){

        throw new Error(
            "Cliente não encontrado."
        );

    }


    /* =====================================================
       VERIFICAR SE CLIENTE JÁ POSSUI CARNÊ
    ===================================================== */

    const carneExistente =
        await buscarCarnePorCliente(
            clienteId
        );


    if(carneExistente){

        return {

            carne:
                carneExistente,

            nova:
                false

        };

    }


    /* =====================================================
       CONFIGURAÇÕES
    ===================================================== */

    const multa =
        Number(
            dados.multa
        );


    const juros =
        Number(
            dados.juros
        );


    const pix =
        String(
            dados.pix || ""
        ).trim();


    const multaFinal =
        Number.isFinite(multa)
            ? multa
            : 2;


    const jurosFinal =
        Number.isFinite(juros)
            ? juros
            : 0.033;


    if(!pix){

        throw new Error(
            "Chave PIX não informada."
        );

    }


    /* =====================================================
       GERAR CÓDIGO
    ===================================================== */

    const codigo =
        gerarCodigoCarne();


    const registro = {

        cliente_id:
            clienteId,

        venda_id:
            dados.vendaId || null,

        codigo_acesso:
            codigo,

        multa:
            multaFinal,

        juros:
            jurosFinal,

        pix:
            pix,

        ativo:
            true

    };


    try{

        const criado =
            await supabaseRequest(
                "carnes",
                {

                    method:
                        "POST",

                    query:
                        "select=id,cliente_id,venda_id,codigo_acesso,multa,juros,pix,ativo,criado_em",

                    headers: {

                        "Prefer":
                            "return=representation"

                    },

                    body:
                        registro

                }
            );


        if(
            !Array.isArray(criado) ||
            !criado.length
        ){

            throw new Error(
                "Carnê não foi criado."
            );

        }


        return {

            carne:
                criado[0],

            nova:
                true

        };

    }catch(erro){

        /*
            Se outro processo criou o carnê
            simultaneamente, tentamos buscar
            novamente pelo cliente.
        */

        const carneDepois =
            await buscarCarnePorCliente(
                clienteId
            );


        if(carneDepois){

            return {

                carne:
                    carneDepois,

                nova:
                    false

            };

        }


        throw erro;

    }

}


/* =========================================================
   HANDLER PRINCIPAL
========================================================= */

module.exports = async (
    req,
    res
) => {

    /*
        O CARNE_SECRET continua obrigatório
        porque os tokens antigos de cobrança
        ainda utilizam essa segurança.
    */

    if(!CARNE_SECRET){

        return res.status(500).json({

            erro:
                "Chave de segurança não configurada."

        });

    }


    /* =====================================================
       POST
    ===================================================== */

    if(req.method === "POST"){

        try{

            let dados =
                req.body;


            if(
                typeof dados === "string"
            ){

                dados =
                    JSON.parse(
                        dados
                    );

            }


            if(!dados){

                return res.status(400).json({

                    erro:
                        "Dados não enviados."

                });

            }


            /* =============================================
               NOVO CARNÊ DIGITAL
            ============================================= */

            if(
                dados.acao ===
                "criarCarne"
            ){

                if(
                    !supabaseConfigurado()
                ){

                    return res.status(500).json({

                        erro:
                            "Supabase não configurado no Vercel."

                    });

                }


                const resultado =
                    await criarOuBuscarCarne(
                        dados
                    );


                const link =
                    req.headers.host
                        ? (
                            (
                                req.headers["x-forwarded-proto"]
                                || "https"
                            ) +
                            "://" +
                            req.headers.host +
                            "/?carne=" +
                            encodeURIComponent(
                                resultado.carne.codigo_acesso
                            )
                        )
                        : null;


                return res.status(200).json({

                    sucesso:
                        true,

                    nova:
                        resultado.nova,

                    carne:
                        resultado.carne,

                    link:
                        link

                });

            }


            /* =============================================
               COBRANÇA ANTIGA
            ============================================= */

            const payload = {

                cliente:
                    dados.cliente || "",

                cpf:
                    dados.cpf || "",

                telefone:
                    dados.telefone || "",

                endereco:
                    dados.endereco || "",

                parcela:
                    dados.parcela || "",

                vencimento:
                    dados.vencimento || "",

                valor:
                    Number(
                        dados.valor || 0
                    ),

                multa:
                    Number(
                        dados.multa || 0
                    ),

                juros:
                    Number(
                        dados.juros || 0
                    ),

                pix:
                    dados.pix || "",

                criadoEm:
                    Date.now()

            };


            if(!payload.cliente){

                return res.status(400).json({

                    erro:
                        "Cliente não informado."

                });

            }


            if(!payload.vencimento){

                return res.status(400).json({

                    erro:
                        "Vencimento não informado."

                });

            }


            if(
                payload.valor <= 0
            ){

                return res.status(400).json({

                    erro:
                        "Valor inválido."

                });

            }


            if(!payload.pix){

                return res.status(400).json({

                    erro:
                        "Chave PIX não informada."

                });

            }


            const dadosCodificados =
                base64urlEncode(
                    JSON.stringify(
                        payload
                    )
                );


            const assinatura =
                criarAssinatura(
                    dadosCodificados,
                    CARNE_SECRET
                );


            const token =
                dadosCodificados +
                "." +
                assinatura;


            return res.status(200).json({

                sucesso:
                    true,

                token:
                    token

            });


        }catch(erro){

            console.error(
                "Erro POST:",
                erro
            );


            return res.status(500).json({

                erro:
                    erro.message ||
                    "Erro ao processar solicitação."

            });

        }

    }


    /* =====================================================
       GET
    ===================================================== */

    if(req.method === "GET"){

        try{

            /* =============================================
               CARNÊ DIGITAL
            ============================================= */

            const codigoCarne =
                req.query.carne;


            if(codigoCarne){

                if(
                    !supabaseConfigurado()
                ){

                    return res.status(500).json({

                        erro:
                            "Supabase não configurado no Vercel."

                    });

                }


                const carne =
                    await buscarCarnePorCodigo(
                        codigoCarne
                    );


                if(!carne){

                    return res.status(404).json({

                        erro:
                            "Carnê não encontrado ou desativado."

                    });

                }


                const resultado =
                    await montarCarneDigital(
                        carne
                    );


                return res.status(200).json(
                    resultado
                );

            }


            /* =============================================
               COBRANÇA INDIVIDUAL ANTIGA
            ============================================= */

            const token =
                req.query.token;


            if(!token){

                return res.status(400).json({

                    erro:
                        "Token não informado."

                });

            }


            const partes =
                token.split(".");


            if(
                partes.length !== 2
            ){

                return res.status(401).json({

                    erro:
                        "Cobrança inválida."

                });

            }


            const dadosCodificados =
                partes[0];


            const assinaturaRecebida =
                partes[1];


            const assinaturaEsperada =
                criarAssinatura(
                    dadosCodificados,
                    CARNE_SECRET
                );


            const recebida =
                Buffer.from(
                    assinaturaRecebida
                );


            const esperada =
                Buffer.from(
                    assinaturaEsperada
                );


            if(
                recebida.length !==
                esperada.length
            ){

                return res.status(401).json({

                    erro:
                        "Cobrança inválida ou alterada."

                });

            }


            const assinaturaValida =
                crypto.timingSafeEqual(
                    recebida,
                    esperada
                );


            if(!assinaturaValida){

                return res.status(401).json({

                    erro:
                        "Cobrança inválida ou alterada."

                });

            }


            const dados =
                JSON.parse(
                    base64urlDecode(
                        dadosCodificados
                    )
                );


            return res.status(200).json({

                sucesso:
                    true,

                dados:
                    dados

            });


        }catch(erro){

            console.error(
                "Erro GET:",
                erro
            );


            return res.status(500).json({

                erro:
                    erro.message ||
                    "Não foi possível processar a solicitação."

            });

        }

    }


    /* =====================================================
       MÉTODO NÃO PERMITIDO
    ===================================================== */

    return res.status(405).json({

        erro:
            "Método não permitido."

    });

};
