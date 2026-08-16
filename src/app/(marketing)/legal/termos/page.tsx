import type { Metadata } from 'next';
import { LegalDocument, LegalSection } from '@/components/legal-document';

export const metadata: Metadata = { title: 'Termos de Uso' };

export default function TermsPage() {
  return (
    <LegalDocument
      title="Termos de Uso"
      updatedAt="Versão 1.0"
      intro="Estes termos regem o uso do LegalMind AI. Trata-se de um documento-modelo que acompanha a plataforma; submeta-o à revisão jurídica antes de operar comercialmente."
    >
      <LegalSection title="1. O que a plataforma é">
        <p>
          O LegalMind AI é uma ferramenta de apoio à análise de processos judiciais. Ela organiza
          documentos, extrai informação estruturada, aponta riscos e sugere providências a partir do
          conteúdo enviado pelo próprio usuário.
        </p>
      </LegalSection>

      <LegalSection title="2. O que a plataforma não é">
        <ul>
          <li>Não presta serviço de advocacia nem emite parecer jurídico.</li>
          <li>Não substitui a avaliação profissional do advogado responsável.</li>
          <li>Não prevê o resultado de julgamentos. Nenhuma análise afirma quem vencerá a causa.</li>
          <li>Não pratica atos processuais nem envia peças a qualquer sistema externo.</li>
          <li>Não garante a exatidão de cálculos de prazo, que são meramente indicativos.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Revisão humana obrigatória">
        <p>
          Todo produto gerado pela plataforma — resumo, análise de risco, sugestão de providência,
          minuta ou relatório — é material de trabalho preliminar. A revisão por profissional
          habilitado é condição para qualquer uso externo. O usuário é integralmente responsável
          pelos atos que praticar com base nesse material.
        </p>
      </LegalSection>

      <LegalSection title="4. Cálculo de prazos">
        <p>
          A calculadora implementa a regra geral dos arts. 219 e 224 do CPC e o recesso forense do
          art. 220, com os feriados nacionais. Ela <strong>não</strong> considera feriados locais,
          suspensões determinadas por cada tribunal, regimes especiais nem decisões que alterem a
          contagem no caso concreto. O prazo válido é sempre o conferido pelo advogado.
        </p>
      </LegalSection>

      <LegalSection title="5. Responsabilidades do usuário">
        <ul>
          <li>Enviar apenas documentos que tenha autorização legítima para tratar.</li>
          <li>Manter a confidencialidade das credenciais de acesso.</li>
          <li>Não utilizar a plataforma para finalidade ilícita ou para tratar dados sem base legal.</li>
          <li>Conferir toda informação antes de utilizá-la em peça, petição ou orientação a cliente.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Conteúdo do usuário">
        <p>
          Os documentos e dados enviados permanecem de titularidade do usuário e de seus clientes. A
          plataforma obtém apenas a licença técnica necessária para armazenar, processar e indexar
          esse conteúdo com o objetivo de prestar o serviço.
        </p>
      </LegalSection>

      <LegalSection title="7. Disponibilidade e limitação de responsabilidade">
        <p>
          O serviço é fornecido no estado em que se encontra. Não há garantia de disponibilidade
          ininterrupta nem de ausência de erros. Na máxima extensão permitida em lei, a
          responsabilidade por perdas decorrentes do uso das análises fica limitada ao valor pago
          pelo usuário nos 12 meses anteriores ao evento.
        </p>
      </LegalSection>

      <LegalSection title="8. Planos, créditos e cobrança">
        <p>
          Cada plano define limites de processos, usuários, documentos e créditos de IA. Créditos são
          consumidos por operação e renovados a cada ciclo. Quando o provedor de pagamento não está
          configurado, a plataforma opera em modo de faturamento manual: os limites são aplicados,
          mas nenhuma cobrança automática é processada.
        </p>
      </LegalSection>

      <LegalSection title="9. Encerramento">
        <p>
          O usuário pode encerrar a conta a qualquer momento em Configurações. O encerramento
          anonimiza o cadastro e revoga o acesso. Se o usuário for o único proprietário de um
          escritório, o escritório também é encerrado.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
