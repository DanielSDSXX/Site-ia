/**
 * Caso fictício de demonstração.
 *
 * TUDO AQUI É INVENTADO: nomes, CPFs, número de processo, valores, datas e
 * decisões. Nenhum dado real de processo é usado — o briefing é explícito
 * quanto a isso, e usar autos reais numa demo seria inaceitável.
 *
 * As peças são escritas com defeitos propositais para que as análises tenham
 * o que encontrar: uma alegação sem prova, um valor divergente entre a inicial
 * e a contestação, e uma data de cobrança que não bate entre as peças.
 */

export const DEMO_PROCESS_NUMBER = '0801234-56.2026.8.09.0051';

export interface DemoDocument {
  title: string;
  kind:
    | 'INITIAL_PETITION'
    | 'ANSWER'
    | 'REPLY'
    | 'DECISION'
    | 'EVIDENCE'
    | 'POWER_OF_ATTORNEY';
  pages: string[];
}

const PETITION_PAGE_1 = `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA VARA CÍVEL DA COMARCA DE GOIÂNIA — GO

Processo nº ${DEMO_PROCESS_NUMBER}

MARIANA COSTA PEREIRA, brasileira, analista administrativa, portadora do documento de identidade fictício nº 00.000.000-0, residente nesta Capital, por sua advogada que esta subscreve, vem respeitosamente à presença de Vossa Excelência propor a presente

AÇÃO DECLARATÓRIA DE INEXISTÊNCIA DE DÉBITO CUMULADA COM INDENIZAÇÃO POR DANOS MORAIS

em face de BANCO EXEMPLO FICTÍCIO S.A., instituição financeira fictícia criada apenas para fins de demonstração, pelos fatos e fundamentos a seguir expostos.

I — DOS FATOS

A autora é correntista do banco réu desde março de 2019, mantendo com a instituição relação contratual de conta corrente e cartão de crédito.

Em 12 de janeiro de 2026, ao consultar a fatura do cartão de crédito final 4321, a autora identificou o lançamento de três cobranças que não reconhece, todas sob a rubrica "SERVIÇO DE PROTEÇÃO PREMIUM", nos valores de R$ 189,90 cada, totalizando R$ 569,70.

A autora jamais contratou o referido serviço. Não houve assinatura de termo, não houve contato telefônico gravado e não houve qualquer manifestação de vontade da autora nesse sentido.

Ao entrar em contato com a central de atendimento do réu em 15 de janeiro de 2026, a autora recebeu o número de protocolo 2026011500789, tendo sido informada de que o caso seria analisado no prazo de cinco dias úteis.`;

const PETITION_PAGE_2 = `Transcorrido o prazo informado, nenhuma solução foi apresentada. Ao contrário: em 02 de fevereiro de 2026 o nome da autora foi inscrito nos cadastros de restrição ao crédito pelo valor de R$ 569,70, conforme extrato que se anexa.

A negativação indevida impediu a autora de concluir a contratação de financiamento estudantil já pré-aprovado, causando-lhe prejuízo concreto e abalo emocional relevante.

A autora sustenta que a cobrança é integralmente indevida e que a inscrição de seu nome em cadastro restritivo, sem prévia notificação, agravou de forma desproporcional o dano sofrido.

II — DO DIREITO

Aplica-se ao caso o Código de Defesa do Consumidor, sendo a autora destinatária final dos serviços prestados pelo réu.

A cobrança por serviço não contratado configura prática abusiva. O ônus de comprovar a existência e a validade da contratação é do fornecedor, nos termos do art. 373, inciso II, do Código de Processo Civil, sendo cabível ainda a inversão do ônus da prova em favor da autora.

A inscrição indevida em cadastro de inadimplentes, por si só, gera dano moral, independentemente de prova do prejuízo concreto.

III — DOS PEDIDOS

Ante o exposto, requer:

a) a concessão de tutela de urgência para a imediata exclusão do nome da autora dos cadastros de restrição ao crédito;

b) a declaração de inexistência do débito de R$ 569,70;

c) a condenação do réu ao pagamento de indenização por danos morais em valor não inferior a R$ 15.000,00;

d) a condenação do réu à repetição do indébito em dobro;

e) a inversão do ônus da prova;

f) a citação do réu para, querendo, apresentar contestação.

Dá-se à causa o valor de R$ 15.569,70.

Nestes termos, pede deferimento.

Goiânia, 20 de fevereiro de 2026.`;

const ANSWER_PAGE_1 = `EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA VARA CÍVEL DA COMARCA DE GOIÂNIA — GO

Processo nº ${DEMO_PROCESS_NUMBER}

BANCO EXEMPLO FICTÍCIO S.A., já qualificado nos autos, vem apresentar CONTESTAÇÃO à ação declaratória proposta por MARIANA COSTA PEREIRA, pelas razões de fato e de direito a seguir.

I — PRELIMINARMENTE

DA ILEGITIMIDADE PASSIVA

O serviço denominado "PROTEÇÃO PREMIUM" é operado por empresa parceira, pessoa jurídica distinta do contestante, responsável pela oferta, contratação e cobrança do produto.

O réu atua apenas como veículo de cobrança na fatura, o que afasta sua legitimidade para responder pela suposta contratação irregular. Requer-se, assim, a extinção do feito sem resolução do mérito.

II — NO MÉRITO

DA REGULARIDADE DA CONTRATAÇÃO

A contratação do serviço ocorreu por meio do aplicativo do banco, em 05 de dezembro de 2025, mediante aceite eletrônico registrado nos sistemas do contestante.

Os lançamentos impugnados totalizam R$ 549,00, e não o valor indicado na inicial, o que já demonstra a imprecisão da narrativa autoral.

A autora foi devidamente notificada acerca da inscrição por correspondência enviada ao endereço cadastrado, cumprindo-se o disposto no art. 43, § 2º, do Código de Defesa do Consumidor.`;

const ANSWER_PAGE_2 = `DA INEXISTÊNCIA DE DANO MORAL

Ainda que se admitisse a irregularidade da cobrança, o mero aborrecimento decorrente de discussão contratual não configura dano moral indenizável.

A autora não comprovou o alegado indeferimento de financiamento estudantil. Não há nos autos qualquer documento emitido por instituição de ensino ou por agente financeiro que demonstre a existência de proposta pré-aprovada, tampouco sua recusa.

Trata-se, portanto, de alegação desacompanhada de qualquer prova, que não pode servir de fundamento para a pretensão indenizatória.

DA IMPOSSIBILIDADE DE REPETIÇÃO EM DOBRO

A repetição em dobro pressupõe má-fé do fornecedor, o que não se verifica na hipótese, em que houve, no máximo, engano justificável.

III — DOS PEDIDOS

Requer o réu:

a) o acolhimento da preliminar de ilegitimidade passiva, com a extinção do processo sem resolução do mérito;

b) subsidiariamente, a total improcedência dos pedidos;

c) a condenação da autora ao pagamento das custas e honorários advocatícios.

Termos em que pede deferimento.

Goiânia, 18 de março de 2026.`;

const DECISION_PAGE = `PODER JUDICIÁRIO DO ESTADO DE GOIÁS
VARA CÍVEL DA COMARCA DE GOIÂNIA

Processo nº ${DEMO_PROCESS_NUMBER}

DECISÃO

Vistos.

Trata-se de ação declaratória de inexistência de débito cumulada com pedido de indenização por danos morais, com pedido de tutela de urgência para exclusão de inscrição em cadastro de restrição ao crédito.

Os elementos trazidos com a inicial demonstram a probabilidade do direito alegado, na medida em que a autora nega a contratação do serviço cobrado e o réu, neste momento processual, ainda não apresentou o instrumento contratual correspondente.

O perigo de dano é evidente, considerando os efeitos da inscrição sobre o acesso ao crédito.

Ante o exposto, DEFIRO a tutela de urgência para determinar a imediata exclusão do nome da autora dos cadastros de restrição ao crédito relativamente ao débito discutido nestes autos, no prazo de 5 dias, sob pena de multa diária de R$ 500,00.

Cite-se o réu.

Intimem-se.

Goiânia, 28 de fevereiro de 2026.`;

const EVIDENCE_PAGE = `EXTRATO DE CONSULTA — CADASTRO DE RESTRIÇÃO AO CRÉDITO
(DOCUMENTO FICTÍCIO — GERADO APENAS PARA DEMONSTRAÇÃO DA PLATAFORMA)

Consulente: MARIANA COSTA PEREIRA
Data da consulta: 05/02/2026

REGISTROS ENCONTRADOS: 1

Credor informante: BANCO EXEMPLO FICTÍCIO S.A.
Natureza: Dívida vencida — cartão de crédito
Data da inclusão: 02/02/2026
Valor: R$ 569,70
Contrato de referência: 4321-PROTECAO-PREMIUM

Observação: nenhum outro registro restritivo foi localizado em nome do consulente.`;

const POWER_OF_ATTORNEY_PAGE = `PROCURAÇÃO AD JUDICIA ET EXTRA
(DOCUMENTO FICTÍCIO — DEMONSTRAÇÃO)

OUTORGANTE: MARIANA COSTA PEREIRA, brasileira, analista administrativa, residente em Goiânia — GO.

OUTORGADA: DRA. HELENA MARQUES DE ARAÚJO, advogada fictícia, OAB/GO nº 00.000.

PODERES: pelo presente instrumento particular de procuração, a outorgante nomeia e constitui sua bastante procuradora a advogada acima qualificada, a quem confere os poderes da cláusula ad judicia et extra, para o foro em geral, podendo propor as ações competentes e defendê-la nas contrárias, seguindo umas e outras até final decisão, bem como os poderes especiais para transigir, desistir, renunciar ao direito sobre o qual se funda a ação, receber e dar quitação, firmar compromissos e substabelecer, com ou sem reserva de poderes.

Goiânia, 18 de fevereiro de 2026.`;

export const DEMO_DOCUMENTS: DemoDocument[] = [
  {
    title: 'Petição inicial (demonstração)',
    kind: 'INITIAL_PETITION',
    pages: [PETITION_PAGE_1, PETITION_PAGE_2],
  },
  {
    title: 'Contestação (demonstração)',
    kind: 'ANSWER',
    pages: [ANSWER_PAGE_1, ANSWER_PAGE_2],
  },
  {
    title: 'Decisão — tutela de urgência (demonstração)',
    kind: 'DECISION',
    pages: [DECISION_PAGE],
  },
  {
    title: 'Extrato de restrição ao crédito (demonstração)',
    kind: 'EVIDENCE',
    pages: [EVIDENCE_PAGE],
  },
  {
    title: 'Procuração (demonstração)',
    kind: 'POWER_OF_ATTORNEY',
    pages: [POWER_OF_ATTORNEY_PAGE],
  },
];

/**
 * Jurisprudência de demonstração.
 *
 * Marcada com `isDemo = true` e SEM URL de fonte real — a interface a exibe
 * com o selo "Fictícia — demonstração". Não se trata de julgado existente e
 * jamais deve ser citada como precedente.
 */
export const DEMO_JURISPRUDENCE = [
  {
    court: 'TRIBUNAL FICTÍCIO DE DEMONSTRAÇÃO',
    judgingBody: 'Câmara Cível Fictícia',
    caseNumber: '0000000-00.0000.0.00.0000',
    summary:
      'EMENTA FICTÍCIA — CRIADA APENAS PARA DEMONSTRAR A BUSCA SEMÂNTICA DA PLATAFORMA. Cobrança de serviço não contratado em fatura de cartão de crédito. Inscrição em cadastro restritivo. Ônus da prova da contratação atribuído ao fornecedor. Este texto não corresponde a nenhum julgado real e não pode ser citado como precedente.',
    thesis:
      'Tese fictícia de demonstração: cabe ao fornecedor comprovar a existência da contratação impugnada pelo consumidor.',
    outcome: 'Exemplo fictício',
    sourceName: 'Conteúdo fictício da demonstração (sem fonte oficial)',
  },
  {
    court: 'TRIBUNAL FICTÍCIO DE DEMONSTRAÇÃO',
    judgingBody: 'Turma Recursal Fictícia',
    caseNumber: '0000000-00.0000.0.00.0001',
    summary:
      'EMENTA FICTÍCIA — CRIADA APENAS PARA DEMONSTRAÇÃO. Dano moral. Necessidade de demonstração do abalo concreto quando a inscrição restritiva é posteriormente cancelada. Texto sem correspondência com julgado real.',
    thesis:
      'Tese fictícia de demonstração: a existência de dano moral depende da análise das circunstâncias concretas do caso.',
    outcome: 'Exemplo fictício',
    sourceName: 'Conteúdo fictício da demonstração (sem fonte oficial)',
  },
];

export const DEMO_MEMORY = [
  {
    kind: 'THESIS' as const,
    title: 'Tese padrão — cobrança de serviço não contratado',
    content:
      'Em casos de cobrança de serviço não contratado, o escritório sustenta que o ônus de comprovar a contratação é do fornecedor (art. 373, II, do CPC), requer a inversão do ônus da prova e pede a exibição do instrumento contratual e da gravação do eventual contato telefônico. A tese subsidiária é a de vício de informação na oferta. (Item de demonstração.)',
    tags: ['consumidor', 'cobrança indevida', 'ônus da prova'],
  },
  {
    kind: 'STYLE_GUIDE' as const,
    title: 'Padrão de linguagem do escritório',
    content:
      'Peças objetivas, sem citações doutrinárias extensas. Fatos em ordem cronológica, cada alegação relevante seguida imediatamente da indicação do documento que a comprova. Evitar adjetivação e expressões como "resta cristalino". Pedidos numerados em alíneas. (Item de demonstração.)',
    tags: ['estilo', 'redação'],
  },
];
