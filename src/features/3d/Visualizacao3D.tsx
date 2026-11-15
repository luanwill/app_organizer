/** Vista 3D (three.js) da página atual: renderiza `montarCena` com camadas, seleção e alertas. */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Disciplina, Status } from '@/core/model';
import { COR_DISCIPLINA, COR_PENDENTE, ROTULO_DISCIPLINA } from '@/core/model';
import { useLevantamento } from '@/core/store';
import { montarCena, type Marcador, type Solido } from './cena';
import { DISCIPLINAS_3D, VISUAL } from './config';
import './vista3d.css';

interface Palco {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Objetos da cena atual (reconstruídos a cada mudança). */
  grupo: THREE.Group;
  desenhar(): void;
}

function geometriaDoSolido(s: Solido): THREE.BufferGeometry {
  if (s.forma === 'caixa') return new THREE.BoxGeometry(s.comprimento, s.altura, s.largura);
  const forma = new THREE.Shape(s.contorno.map((p) => new THREE.Vector2(p.x, p.z)));
  const geometria = new THREE.ExtrudeGeometry(forma, { depth: s.altura, bevelEnabled: false });
  // a extrusão nasce no plano XY subindo em +Z; girar leva o contorno para XZ e a espessura para −Y
  geometria.rotateX(Math.PI / 2);
  geometria.translate(0, s.base + s.altura, 0);
  return geometria;
}

/** Libera geometrias e materiais do grupo e o esvazia. */
function limparGrupo(grupo: THREE.Group): void {
  const materiais = new Set<THREE.Material>();
  grupo.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
      (obj.geometry as THREE.BufferGeometry).dispose();
      for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) materiais.add(m as THREE.Material);
    }
  });
  materiais.forEach((m) => m.dispose());
  grupo.clear();
}

export function Visualizacao3D() {
  const projeto = useLevantamento((s) => s.projeto);
  const pagina = useLevantamento((s) => s.paginaAtual);
  const selecaoIds = useLevantamento((s) => s.selecaoIds);
  const camadas = projeto.camadas;

  const telaRef = useRef<HTMLDivElement>(null);
  const palcoRef = useRef<Palco | null>(null);
  /** Página enquadrada pela câmera (o enquadramento só se repete ao trocar de página ou sair do vazio). */
  const enquadradoRef = useRef<number | null>(null);
  const [erroWebGL, setErroWebGL] = useState(false);

  const cena = useMemo(() => montarCena(projeto, pagina), [projeto, pagina]);
  const solidos = useMemo(() => cena.solidos.filter((s) => camadas[s.disciplina]), [cena, camadas]);
  const marcadores = useMemo(() => cena.marcadores.filter((m) => camadas[m.disciplina]), [cena, camadas]);
  const vazio = solidos.length + marcadores.length === 0;

  // --- palco: renderer, câmera, controles, luzes, redimensionamento e clique
  useEffect(() => {
    const tela = telaRef.current;
    if (!tela) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setErroWebGL(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, VISUAL.maxPixelRatio));
    tela.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(VISUAL.corFundo);
    const camera = new THREE.PerspectiveCamera(VISUAL.campoVisaoGraus, 1, VISUAL.planoProximoM, VISUAL.planoDistanteM);
    scene.add(new THREE.AmbientLight(0xffffff, VISUAL.luzAmbiente));
    const sol = new THREE.DirectionalLight(0xffffff, VISUAL.luzDirecional);
    sol.position.set(...VISUAL.direcaoLuz);
    scene.add(sol);
    const grupo = new THREE.Group();
    scene.add(grupo);

    const controls = new OrbitControls(camera, renderer.domElement);
    const desenhar = (): void => renderer.render(scene, camera);
    controls.addEventListener('change', desenhar);

    const ajustar = (): void => {
      const largura = Math.max(1, tela.clientWidth);
      const altura = Math.max(1, tela.clientHeight);
      renderer.setSize(largura, altura);
      camera.aspect = largura / altura;
      camera.updateProjectionMatrix();
      desenhar();
    };
    const observador = new ResizeObserver(ajustar);
    observador.observe(tela);
    ajustar();

    // clique (sem arrastar) → seleciona o elemento na árvore
    const raycaster = new THREE.Raycaster();
    let inicioClique: { x: number; y: number } | null = null;
    const aoPressionar = (ev: PointerEvent): void => {
      inicioClique = { x: ev.clientX, y: ev.clientY };
    };
    const aoSoltar = (ev: PointerEvent): void => {
      const inicio = inicioClique;
      inicioClique = null;
      if (!inicio || Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) > VISUAL.toleranciaCliquePx) return;
      const area = renderer.domElement.getBoundingClientRect();
      const ponteiro = new THREE.Vector2(
        ((ev.clientX - area.left) / area.width) * 2 - 1,
        -((ev.clientY - area.top) / area.height) * 2 + 1,
      );
      raycaster.setFromCamera(ponteiro, camera);
      const alvo = raycaster.intersectObjects(grupo.children, false).find((i) => typeof i.object.userData.elementoId === 'string');
      if (alvo) useLevantamento.getState().selecionar([alvo.object.userData.elementoId as string]);
    };
    renderer.domElement.addEventListener('pointerdown', aoPressionar);
    renderer.domElement.addEventListener('pointerup', aoSoltar);

    palcoRef.current = { renderer, scene, camera, controls, grupo, desenhar };
    return () => {
      palcoRef.current = null;
      enquadradoRef.current = null;
      observador.disconnect();
      renderer.domElement.removeEventListener('pointerdown', aoPressionar);
      renderer.domElement.removeEventListener('pointerup', aoSoltar);
      controls.removeEventListener('change', desenhar);
      controls.dispose();
      limparGrupo(grupo);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  // --- objetos: reconstruídos quando a cena, as camadas ou a seleção mudam
  useEffect(() => {
    const palco = palcoRef.current;
    if (!palco) return;
    const { grupo, camera, controls } = palco;
    limparGrupo(grupo);

    const selecionados = new Set(selecaoIds);
    const materiais = new Map<string, THREE.MeshLambertMaterial>();
    const materialDe = (disciplina: Disciplina, status: Status, selecionado: boolean): THREE.MeshLambertMaterial => {
      const chave = `${disciplina}|${status}|${selecionado}`;
      let material = materiais.get(chave);
      if (!material) {
        const pendente = status === 'pendente';
        material = new THREE.MeshLambertMaterial({
          color: pendente ? COR_PENDENTE : COR_DISCIPLINA[disciplina],
          transparent: pendente,
          opacity: pendente ? VISUAL.opacidadePendente : 1,
          depthWrite: !pendente,
        });
        if (selecionado) {
          material.emissive = new THREE.Color(VISUAL.corSelecao);
          material.emissiveIntensity = VISUAL.brilhoSelecao;
        }
        materiais.set(chave, material);
      }
      return material;
    };
    const adicionar = (geometria: THREE.BufferGeometry, item: Solido | Marcador): THREE.Mesh => {
      const malha = new THREE.Mesh(geometria, materialDe(item.disciplina, item.status, selecionados.has(item.elementoId)));
      malha.userData.elementoId = item.elementoId;
      grupo.add(malha);
      return malha;
    };

    for (const s of solidos) {
      const malha = adicionar(geometriaDoSolido(s), s);
      if (s.forma === 'caixa') {
        malha.position.set(s.centro.x, s.centro.y, s.centro.z);
        malha.rotation.y = s.rotacaoY;
      }
    }
    for (const m of marcadores) {
      const esfera = new THREE.SphereGeometry(VISUAL.raioMarcadorM, VISUAL.segmentosMarcador, VISUAL.segmentosMarcador);
      adicionar(esfera, m).position.set(m.posicao.x, m.posicao.y, m.posicao.z);
    }

    // limites da cena → grade no piso e enquadramento
    const limites = new THREE.Box3();
    if (grupo.children.length > 0) limites.setFromObject(grupo);
    else limites.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(VISUAL.extensaoMinimaM, 0, VISUAL.extensaoMinimaM));
    const tamanho = limites.getSize(new THREE.Vector3());
    const centro = limites.getCenter(new THREE.Vector3());
    const extensao = Math.max(tamanho.x, tamanho.y, tamanho.z, VISUAL.extensaoMinimaM);

    const ladoGrade = Math.ceil((Math.max(tamanho.x, tamanho.z, VISUAL.extensaoMinimaM) * VISUAL.fatorGrade) / VISUAL.passoGradeM) * VISUAL.passoGradeM;
    const grade = new THREE.GridHelper(ladoGrade, Math.round(ladoGrade / VISUAL.passoGradeM), VISUAL.corGradeEixo, VISUAL.corGrade);
    grade.position.set(centro.x, 0, centro.z);
    grupo.add(grade);

    if (grupo.children.length > 1 && enquadradoRef.current !== pagina) {
      enquadradoRef.current = pagina;
      const distanciaCamera = extensao * VISUAL.fatorDistanciaCamera;
      const [vx, vy, vz] = VISUAL.direcaoCamera;
      camera.position.set(centro.x + distanciaCamera * vx, centro.y + distanciaCamera * vy, centro.z + distanciaCamera * vz);
      controls.target.copy(centro);
      controls.update();
    } else if (grupo.children.length <= 1) {
      enquadradoRef.current = null;
    }
    palco.desenhar();
  }, [solidos, marcadores, selecaoIds, pagina]);

  return (
    <div className="v3d">
      <div className="v3d-tela" ref={telaRef} />
      <div className="v3d-camadas">
        {DISCIPLINAS_3D.map((d) => (
          <button
            key={d}
            className={camadas[d] ? 'ativo' : 'v3d-camada-oculta'}
            aria-pressed={camadas[d]}
            title={camadas[d] ? 'Ocultar camada' : 'Mostrar camada'}
            onClick={() => useLevantamento.getState().definirCamada(d, !camadas[d])}
          >
            <span className="bolinha" style={{ background: COR_DISCIPLINA[d] }} />
            {ROTULO_DISCIPLINA[d]}
          </button>
        ))}
      </div>
      {erroWebGL ? (
        <div className="v3d-vazio">Não foi possível iniciar o 3D: o navegador não disponibilizou WebGL.</div>
      ) : (
        vazio && (
          <div className="v3d-vazio">
            {cena.solidos.length + cena.marcadores.length > 0
              ? 'Todas as camadas com objetos estão ocultas. Ligue uma camada para ver o 3D.'
              : 'Nada para mostrar em 3D nesta página. Desenhe paredes, pilares, vigas, lajes ou pontos — e informe o pé-direito.'}
          </div>
        )
      )}
      {cena.alertas.length > 0 && (
        <div className="v3d-alertas">
          {cena.alertas.map((a) => (
            <div key={a} className="aviso">
              {a}
            </div>
          ))}
        </div>
      )}
      {!vazio && !erroWebGL && <div className="v3d-dica">Arraste para girar · role para aproximar · clique para selecionar</div>}
    </div>
  );
}
