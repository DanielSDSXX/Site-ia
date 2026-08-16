import type { Metadata } from 'next';
import { LegalDocument, LegalSection } from '@/components/legal-document';

export const metadata: Metadata = { title: 'Política de Privacidade' };

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Política de Privacidade"
      updatedAt="Versão 1.0"
      intro="Esta política descreve como o LegalMind AI trata dados pessoais e documentos jurídicos. Ela foi escrita tendo como referência a Lei nº 13.709/2018 (LGPD). Este é um documento-modelo que acompanha a plataforma: antes de operar comercialmente, submeta-o à revisão jurídica e à auditoria de adequação da sua organização."
    >
      <LegalSection title="1. Quem trata os dados">
        <p>
          O escritório usuário da plataforma é o <strong>controlador</strong> dos dados contidos nos
          processos e documentos que envia. O fornecedor da plataforma atua como{' '}
          <strong>operador</strong>, tratando esses dados conforme as instruções do controlador e
          exclusivamente para prestar o serviço contratado.
        </p>
      </LegalSection>

      <LegalSection title="2. Dados tratados">
        <ul>
          <li>
            <strong>Dados de cadastro:</strong> nome, e-mail, senha (armazenada apenas como hash
            bcrypt), organização e perfil de acesso.
          </li>
          <li>
            <strong>Documentos processuais:</strong> arquivos enviados, texto extraído, páginas e
            trechos indexados, além dos metadados técnicos (tamanho, hash, tipo, data).
          </li>
          <li>
            <strong>Dados operacionais:</strong> processos, partes, prazos, tarefas, clientes e
            anotações cadastradas pelo usuário.
          </li>
          <li>
            <strong>Registros técnicos:</strong> data e hora de acesso, agente do navegador e
            endereço IP <em>pseudonimizado</em> (armazenamos apenas um hash, nunca o IP em claro).
          </li>
          <li>
            <strong>Telemetria de IA:</strong> modelo utilizado, contagem de tokens, custo estimado e
            duração — sem o conteúdo das análises.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Finalidades">
        <p>
          Os dados são tratados para autenticar usuários, processar e indexar documentos, executar as
          análises solicitadas, controlar limites de plano, apurar consumo e manter registros de
          auditoria e segurança. Não há tratamento para publicidade nem venda de dados.
        </p>
      </LegalSection>

      <LegalSection title="4. Inteligência artificial e provedores externos">
        <p>
          Quando um provedor externo de IA está configurado, trechos dos documentos relevantes para a
          pergunta ou análise são enviados a esse provedor para processamento. Nunca enviamos o
          acervo completo — apenas as passagens recuperadas para aquela operação específica.
        </p>
        <p>
          A plataforma inclui a configuração{' '}
          <strong>&ldquo;seus documentos não serão utilizados para treinamento de modelos
          externos&rdquo;</strong>. Essa configuração expressa a instrução do controlador; o
          cumprimento efetivo depende dos termos contratuais firmados com o provedor de IA
          escolhido. Verifique a política de retenção e de treinamento do provedor antes de tratar
          dados sensíveis.
        </p>
        <p>
          A arquitetura permite trocar de provedor, inclusive por um modelo executado em
          infraestrutura própria, sem alteração no restante do sistema.
        </p>
      </LegalSection>

      <LegalSection title="5. Compartilhamento">
        <p>
          Dados não são compartilhados com terceiros além dos operadores necessários à prestação do
          serviço: provedor de infraestrutura, provedor de armazenamento e provedor de IA
          configurado. Dados de uma organização nunca são acessíveis a outra: o isolamento é aplicado
          em cada consulta ao banco de dados.
        </p>
      </LegalSection>

      <LegalSection title="6. Segurança">
        <ul>
          <li>Tráfego cifrado (HTTPS) e cabeçalhos de segurança restritivos.</li>
          <li>Senhas com hash bcrypt e bloqueio temporário após tentativas sucessivas.</li>
          <li>Sessões opacas revogáveis, com expiração e registro de uso.</li>
          <li>Documentos criptografados em repouso (AES-256-GCM) quando a chave está configurada.</li>
          <li>Acesso a arquivos apenas por endpoint autenticado — sem URLs públicas ou links assinados.</li>
          <li>Validação de tipo real do arquivo (assinatura binária) e limite de tamanho no upload.</li>
          <li>Registro de auditoria de login, upload, download, exclusão, análise e alterações.</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Retenção e eliminação">
        <p>
          Documentos e processos permanecem armazenados enquanto a conta estiver ativa. A exclusão de
          um documento remove o arquivo do armazenamento e apaga os trechos indexados. A exclusão da
          conta anonimiza o cadastro e revoga todas as sessões. Registros de auditoria são mantidos
          de forma pseudonimizada para fins de segurança e cumprimento de obrigação legal.
        </p>
      </LegalSection>

      <LegalSection title="8. Direitos do titular">
        <p>
          O titular pode solicitar confirmação de tratamento, acesso, correção, portabilidade,
          eliminação e informação sobre compartilhamento. Em{' '}
          <strong>Configurações → Privacidade e dados</strong> estão disponíveis a exportação dos
          dados em JSON e a exclusão da conta. Demais solicitações devem ser dirigidas ao controlador
          — o escritório responsável pelo processo.
        </p>
      </LegalSection>

      <LegalSection title="9. Limitação">
        <p>
          Nenhuma plataforma pode se declarar &ldquo;100% adequada à LGPD&rdquo; sem auditoria
          especializada e sem considerar o contexto de uso de cada organização. As medidas descritas
          aqui são técnicas e verificáveis no código; a adequação jurídica completa depende também de
          políticas internas, contratos com operadores e avaliação de impacto conduzida pelo
          controlador.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
