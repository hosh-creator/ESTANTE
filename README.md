# Estante

Site de histórias para um grupo de amigos, inspirado no AO3. Páginas estáticas (HTML, CSS e JS) que você hospeda no **GitHub Pages**, com banco de dados e login no **Supabase** (plano grátis).

O que tem: login por e-mail e senha, obras com tags e avisos próprios, capítulos em texto normal (itálico e negrito) ou HTML, upload de capítulos (.txt, .md, .html, .docx), curtidas e comentários por capítulo.

## Passo a passo

### 1. Criar o projeto no Supabase
1. Crie uma conta em https://supabase.com e clique em **New project** (guarde a senha do banco, mas você não vai precisar dela no site).
2. No menu **SQL Editor**, cole o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Opcional, para só entrar quem você convidar: no fim da seção "Código de convite" do `schema.sql`, descomente a linha `insert into public.invite ...` e troque o código **antes** de rodar. Passe esse código aos amigos; eles digitam ao criar a conta. Sem código, qualquer pessoa com o link cria conta.

### 2. Ajustar o login
Em **Authentication > Sign In / Providers > Email**:
- **Confirm email**: se desligar, a conta funciona na hora. Se deixar ligado, cada pessoa precisa clicar no link que chega por e-mail.

Em **Authentication > URL Configuration**:
- **Site URL**: o endereço do seu site no GitHub Pages (ex.: `https://seu-usuario.github.io/estante/`).
- **Redirect URLs**: adicione o mesmo endereço. É por ele que voltam os links de confirmação e de "esqueci a senha".

### 3. Colocar as chaves no site
Em **Project Settings > API**, copie a **Project URL** e a chave **anon public**. Cole em `config.js`.
A chave anon é pública por natureza; quem protege os dados são as regras do `schema.sql`. **Nunca** use a chave `service_role`.

### 4. Publicar no GitHub
1. Crie um repositório e envie todos os arquivos desta pasta (`index.html`, `style.css`, `app.js`, `config.js`, `supabase/`).
2. Em **Settings > Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Em alguns minutos o site abre no endereço indicado ali. Use esse mesmo endereço no passo 2.

## Como as permissões funcionam
- Qualquer pessoa com o link **lê** as obras. Para exigir login até para ler, troque `anon, authenticated` por `authenticated` nas cinco políticas "ler ..." do `schema.sql` (e rode de novo no SQL Editor, apagando as antigas antes).
- Só quem está logado cria obras, curte e comenta.
- Cada pessoa edita e apaga apenas as próprias obras e capítulos. Comentários podem ser apagados por quem escreveu ou pela autoria da obra.
- Você, como dona do projeto, pode mexer em tudo pelo painel do Supabase (**Table Editor**).

## Formatos de capítulo
- **Texto normal**: linha em branco separa parágrafos; `*itálico*`, `**negrito**`; `***` sozinho numa linha vira quebra de cena.
- **HTML**: `<p>`, `<em>`, `<strong>`, `<h2>`, `<blockquote>`, `<hr>`, `<a>` etc. Scripts, estilos e formulários são removidos antes de mostrar.
- **Upload**: .txt e .md entram como texto; .html e .docx entram como HTML. Ao escolher vários arquivos de uma vez, cada um vira um capítulo, na ordem dos nomes (`cap 2` antes de `cap 10`).

## Bom saber
- Projetos grátis do Supabase pausam após cerca de uma semana sem uso. É só reativar no painel.
- Para testar no seu computador, rode `python3 -m http.server` na pasta e abra `http://localhost:8000` (adicione esse endereço nas Redirect URLs).
