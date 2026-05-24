import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Breadcrumb,
  Button,
  Empty,
  message,
  Space,
  Spin,
  Tree,
  Typography,
} from "antd";
import type { DataNode } from "antd/es/tree";
import {
  CheckCircleOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import ConfigEditor from "@/components/ConfigEditor";
import {
  getConfigTree,
  getConfigFile,
  validateConfig,
  type ConfigTreeNode,
} from "@/utils/api";

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert the backend tree into Ant Design `DataNode[]` for the Tree component. */
function toAntTreeData(nodes: ConfigTreeNode[]): DataNode[] {
  return nodes.map((n) => {
    if (n.type === "directory") {
      return {
        key: n.path,
        title: n.name,
        icon: ({ expanded = false }: { expanded?: boolean }) =>
          expanded ? (
            <FolderOpenOutlined style={{ color: "#1668dc" }} />
          ) : (
            <FolderOutlined style={{ color: "#1668dc" }} />
          ),
        children: n.children ? toAntTreeData(n.children) : [],
        selectable: false,
      };
    }
    return {
      key: n.path,
      title: n.name,
      icon: <FileTextOutlined style={{ color: "rgba(255,255,255,0.65)" }} />,
      isLeaf: true,
    };
  });
}

/** Split a file path like "examples/embodiment/config/foo.yaml" into breadcrumb segments. */
function pathSegments(path: string): { label: string }[] {
  return path.split("/").map((seg) => ({ label: seg }));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ConfigEditorPage: React.FC = () => {
  // Tree data
  const [treeData, setTreeData] = useState<ConfigTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);

  // Active file
  const [activePath, setActivePath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);

  // Validation state
  const [validating, setValidating] = useState(false);

  // ------ Fetch tree on mount ------
  useEffect(() => {
    setTreeLoading(true);
    getConfigTree()
      .then(setTreeData)
      .catch((err) => {
        console.error(err);
        message.error("加载配置文件树失败");
      })
      .finally(() => setTreeLoading(false));
  }, []);

  const antTreeData = useMemo(() => toAntTreeData(treeData), [treeData]);

  // ------ Select a file ------
  const handleSelect = useCallback(
    (
      _keys: React.Key[],
      info: { node: { key: React.Key; isLeaf?: boolean } },
    ) => {
      const { node } = info;
      if (!node.isLeaf) return;
      const filePath = String(node.key);
      if (filePath === activePath) return;

      setActivePath(filePath);
      setFileLoading(true);
      getConfigFile(filePath)
        .then((res) => setContent(res.content))
        .catch((err) => {
          console.error(err);
          message.error("读取文件失败");
        })
        .finally(() => setFileLoading(false));
    },
    [activePath],
  );

  // ------ Validate ------
  const handleValidate = useCallback(async () => {
    if (!activePath) return;
    setValidating(true);
    try {
      const res = await validateConfig(activePath, content);
      if (res.valid) {
        message.success("YAML 配置验证通过");
      } else {
        message.error(
          `验证失败: ${res.errors?.join("; ") ?? "未知错误"}`,
        );
      }
    } catch (err) {
      console.error(err);
      message.error("验证请求失败");
    } finally {
      setValidating(false);
    }
  }, [activePath, content]);

  // ------ Save stub ------
  const handleSave = useCallback(() => {
    message.info("保存功能即将推出");
  }, []);

  // ------ Render ------
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 56px - 56px - 48px)",
        /* account for header (56), footer (56), Content padding (24*2) */
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          flexShrink: 0,
        }}
      >
        <div>
          {activePath ? (
            <Breadcrumb
              items={pathSegments(activePath).map((s) => ({
                title: (
                  <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
                    {s.label}
                  </Text>
                ),
              }))}
            />
          ) : (
            <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>
              配置文件浏览器
            </Text>
          )}
        </div>

        <Space>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={validating}
            disabled={!activePath}
            onClick={handleValidate}
          >
            验证
          </Button>
          <Button
            icon={<SaveOutlined />}
            disabled={!activePath}
            onClick={handleSave}
          >
            保存
          </Button>
        </Space>
      </div>

      {/* Main area: sidebar + editor */}
      <div
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
          border: "1px solid #303030",
          borderRadius: 6,
        }}
      >
        {/* Left panel: file tree */}
        <div
          style={{
            width: 250,
            minWidth: 250,
            borderRight: "1px solid #303030",
            background: "#1a1a1a",
            overflowY: "auto",
            padding: "8px 0",
          }}
        >
          <div
            style={{
              padding: "4px 12px 8px",
              fontSize: 12,
              fontWeight: 600,
              color: "rgba(255,255,255,0.45)",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            配置文件
          </div>
          {treeLoading ? (
            <div style={{ textAlign: "center", padding: 24 }}>
              <Spin size="small" />
            </div>
          ) : (
            <Tree
              treeData={antTreeData}
              showIcon
              blockNode
              selectedKeys={activePath ? [activePath] : []}
              onSelect={handleSelect}
              defaultExpandedKeys={
                antTreeData.length > 0
                  ? [antTreeData[0].key as string]
                  : []
              }
              style={{
                background: "transparent",
                color: "rgba(255,255,255,0.85)",
              }}
            />
          )}
        </div>

        {/* Right panel: Monaco editor */}
        <div style={{ flex: 1, position: "relative" }}>
          {fileLoading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10,
                background: "rgba(20,20,20,0.7)",
              }}
            >
              <Spin />
            </div>
          )}
          {activePath ? (
            <ConfigEditor
              value={content}
              onChange={setContent}
              language="yaml"
            />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
              }}
            >
              <Empty
                description={
                  <Text style={{ color: "rgba(255,255,255,0.45)" }}>
                    从左侧选择一个配置文件
                  </Text>
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConfigEditorPage;
