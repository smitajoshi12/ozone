/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from 'react';
import axios from 'axios';
import {Icon, Row, Tooltip,Tabs,Table,Button, Input,Dropdown,Menu} from 'antd';
import filesize from 'filesize';
//import * as Plotly from 'plotly.js';
import {PaginationConfig} from 'antd/lib/pagination';
import {showDataFetchError, timeFormat} from 'utils/common';
import './metrics.less';
import { ColumnSearch } from 'utils/columnSearch';
import moment from 'moment';
const DEFAULT_TABLE_COUNT = 10;
const DEFAULT_DISPLAY_SIZE = 'Size';

const {TabPane} = Tabs;

const size = filesize.partial({standard: 'iec'});

interface IMetricsState {
  isLoading: boolean;
  missingDataSource: IContainerResponse[];
  expandedRowData: IExpandedRow;
  inputPath: string;
  displayLimit: number;
  displaySizeCount: string;
}

//New Code
interface IContainerResponse {
  containerID: number;
  containerState: string;
  unhealthySince: string;
  expectedReplicaCount: number;
  actualReplicaCount: number;
  replicaDeltaCount: number;
  reason: string;
  keys: number;
  pipelineID: string;
  replicas: IContainerReplicas[];
}

export interface IContainerReplica {
  containerId: number;
  datanodeHost: string;
  firstReportTimestamp: number;
  lastReportTimestamp: number;
}

export interface IContainerReplicas {
  containerId: number;
  datanodeUuid: string;
  datanodeHost: string;
  firstSeenTime: number;
  lastSeenTime: number;
  lastBcsId: number;
}

interface IUnhealthyContainersResponse {
  missingCount: number;
  underReplicatedCount: number;
  overReplicatedCount: number;
  misReplicatedCount: number;
  containers: IContainerResponse[];
}

interface IKeyResponse {
  Volume: string;
  Bucket: string;
  Key: string;
  DataSize: number;
  Versions: number[];
  Blocks: object;
  CreationTime: string;
  ModificationTime: string;
}

interface IContainerKeysResponse {
  totalCount: number;
  keys: IKeyResponse[];
}

const KEY_TABLE_COLUMNS = [
  {
    title: 'Volume',
    dataIndex: 'Volume',
    key: 'Volume'
  },
  {
    title: 'Bucket',
    dataIndex: 'Bucket',
    key: 'Bucket'
  },
  {
    title: 'Key',
    dataIndex: 'Key',
    key: 'Key'
  },
  {
    title: 'Size',
    dataIndex: 'DataSize',
    key: 'DataSize',
    render: (dataSize: number) => <div>{size(dataSize)}</div>
  },
  {
    title: 'Date Created',
    dataIndex: 'CreationTime',
    key: 'CreationTime',
    render: (date: string) => moment(date).format('lll')
  },
  {
    title: 'Date Modified',
    dataIndex: 'ModificationTime',
    key: 'ModificationTime',
    render: (date: string) => moment(date).format('lll')
  }
];

const CONTAINER_TAB_COLUMNS = [
  {
    title: 'Container ID',
    dataIndex: 'containerID',
    key: 'containerID',
    isSearchable: true,
    sorter: (a: IContainerResponse, b: IContainerResponse) => a.containerID - b.containerID
  },
  {
    title: 'No. of Keys',
    dataIndex: 'keys',
    key: 'keys',
    sorter: (a: IContainerResponse, b: IContainerResponse) => a.keys - b.keys
  },
  {
    title: 'Actual/Expected Replica(s)',
    dataIndex: 'expectedReplicaCount',
    key: 'expectedReplicaCount',
    render: (expectedReplicaCount: number, record: IContainerResponse) => {
      const actualReplicaCount = record.actualReplicaCount;
      return (
        <span>
          {actualReplicaCount} / {expectedReplicaCount}
        </span>
      );
    }
  },
  {
    title: 'Datanodes',
    dataIndex: 'replicas',
    key: 'replicas',
    render: (replicas: IContainerReplicas[]) => (
      <div>
        {replicas && replicas.map(replica => {
          const tooltip = (
            <div>
              <div>First Report Time: {timeFormat(replica.firstSeenTime)}</div>
              <div>Last Report Time: {timeFormat(replica.lastSeenTime)}</div>
            </div>
          );
          return (
            <div key={replica.datanodeHost}>
              <Tooltip
                placement='left'
                title={tooltip}
              >
                <Icon type='info-circle' className='icon-small'/>
              </Tooltip>
              <span className='pl-5'>
                {replica.datanodeHost}
              </span>
            </div>
          );
        }
        )}
      </div>
    )
  },
  {
    title: 'Pipeline ID',
    dataIndex: 'pipelineID',
    key: 'pipelineID',
    sorter: (a: IContainerResponse, b: IContainerResponse) => a.pipelineID.localeCompare(b.pipelineID)
  },
  {
    title: 'Unhealthy Since',
    dataIndex: 'unhealthySince',
    key: 'unhealthySince',
    render: (unhealthySince: number) => timeFormat(unhealthySince),
    sorter: (a: IContainerResponse, b: IContainerResponse) => a.unhealthySince - b.unhealthySince
  }
];

interface IExpandedRow {
  [key: number]: IExpandedRowState;
}

interface IExpandedRowState {
  containerId: number;
  loading: boolean;
  dataSource: IKeyResponse[];
  totalCount: number;
}

interface IMissingContainersState {
  loading: boolean;
  missingDataSource: IContainerResponse[];
  expandedRowData: IExpandedRow;
}

export class Metrics extends React.Component<Record<string, object>, IMetricsState> {
  constructor(props = {}) {
    super(props);
    this.state = {
      isLoading: false,
      missingDataSource: [],
      expandedRowData: {},
      inputPath: '/',
      displayLimit: DEFAULT_TABLE_COUNT,
      displaySizeCount: DEFAULT_DISPLAY_SIZE
    };
  }

  handleChange = e => {
    this.setState({inputPath: e.target.value});
  };

  // handleSubmit = _e => {
  //   // Avoid empty request trigger 400 response
  //   if (!this.state.inputPath) {
  //     this.updateMatricsTable('/', DEFAULT_TABLE_COUNT);
  //     return;
  // };


  // The returned path is passed in, which should have been
  // normalized by the backend
  goBack = (e, path) => {
    if (!path || path === '/') {
      return;
    }

    const arr = path.split('/');
    let parentPath = arr.slice(0, -1).join('/');
    if (parentPath.length === 0) {
      parentPath = '/';
    }

    this.updateMatricsTable(parentPath, DEFAULT_TABLE_COUNT, DEFAULT_DISPLAY_SIZE);
  };

  componentDidMount(): void {
    // Fetch file size counts on component mount
    this.setState({
      isLoading: true
    });
    // By default render the Metrics End Point for root path
    this.updateMatricsTable('/', DEFAULT_TABLE_COUNT, DEFAULT_DISPLAY_SIZE);
  }

  onShowSizeChange = (current: number, pageSize: number) => {
    console.log(current, pageSize);
  };

  onRowExpandClick = (expanded: boolean, record: IContainerResponse) => {
    if (expanded) {
      this.setState(({expandedRowData}) => {
        const expandedRowState: IExpandedRowState = expandedRowData[record.containerID] ?
          Object.assign({}, expandedRowData[record.containerID], {loading: true}) :
          {containerId: record.containerID, loading: true, dataSource: [], totalCount: 0};
        return {
          expandedRowData: Object.assign({}, expandedRowData, {[record.containerID]: expandedRowState})
        };
      });
      axios.get(`/api/v1/containers/${record.containerID}/keys`).then(response => {
        const containerKeysResponse: IContainerKeysResponse = response.data;
        this.setState(({expandedRowData}) => {
          const expandedRowState: IExpandedRowState =
              Object.assign({}, expandedRowData[record.containerID],
                {loading: false, dataSource: containerKeysResponse.keys, totalCount: containerKeysResponse.totalCount});
          return {
            expandedRowData: Object.assign({}, expandedRowData, {[record.containerID]: expandedRowState})
          };
        });
      }).catch(error => {
        this.setState(({expandedRowData}) => {
          const expandedRowState: IExpandedRowState =
              Object.assign({}, expandedRowData[record.containerID],
                {loading: false});
          return {
            expandedRowData: Object.assign({}, expandedRowData, {[record.containerID]: expandedRowState})
          };
        });
        showDataFetchError(error.toString());
      });
    }
  };

  expandedRowRender = (record: IContainerResponse) => {
    const {expandedRowData} = this.state;
    const containerId = record.containerID;
    if (expandedRowData[containerId]) {
      const containerKeys: IExpandedRowState = expandedRowData[containerId];
      const dataSource = containerKeys.dataSource.map(record => (
        {...record, uid: `${record.Volume}/${record.Bucket}/${record.Key}`}
      ));
      const paginationConfig: PaginationConfig = {
        showTotal: (total: number, range) => `${range[0]}-${range[1]} of ${total} keys`
      };
      return (
        <Table
          loading={containerKeys.loading} dataSource={dataSource}
          columns={KEY_TABLE_COLUMNS} pagination={paginationConfig}
          rowKey='uid'/>
      );
    }

    return <div>Loading...</div>;
  };
  
  searchColumn = () => {
    return CONTAINER_TAB_COLUMNS.reduce<any[]>((filtered, column) => {
      if (column.isSearchable) {
        const newColumn = {
          ...column,
          ...new ColumnSearch(column).getColumnSearchProps(column.dataIndex)
        };
        filtered.push(newColumn);
      } else {
        filtered.push(column);
      }

      return filtered;
    }, [])
  };

  updateDisplayLimit(e): void {
    console.log("updateDisplayLimit", e);
    let sizecount = DEFAULT_DISPLAY_SIZE;
    let res = DEFAULT_TABLE_COUNT;
    if (e.key === 'count' || e.key === 'size') {
      sizecount = e.key;
    } else {
      res = Number.parseInt(e.key);
      console.log("res", res);
    }

    this.updateMatricsTable(this.state.inputPath, res, sizecount);
  }

  updateMatricsTable = (path: string, limit: number, sizecount:string) => {
    
    this.setState({
      isLoading: true
    });
    const metricsEndpoint = `/api/v1/containers/unhealthy`;
    axios.get(metricsEndpoint).then(response => {
        const status = response.status;
        const allContainersResponseData: IUnhealthyContainersResponse = response.data;
        const allContainers: IContainerResponse[] = allContainersResponseData.containers;
  
        const missingContainersResponseData = allContainers && allContainers.filter(item => item.containerState === 'MISSING');
        const mContainers: IContainerResponse[] = missingContainersResponseData;
  
        this.setState({
          isLoading: false,
          missingDataSource: mContainers
        });
      
      if (status === 'PATH_NOT_FOUND') {
        console.log("Before setstate:");
        this.setState({
          // Normalized path
          isLoading: false,
          displayLimit: limit,
          inputPath: status
        });
      }
      console.log("updateMatricsTable", this.state.inputPath,limit,sizecount);
      this.setState({
        // Normalized path
        isLoading: false,
        displayLimit: limit,
        //inputPath: status
      });
      
      
      
    }).catch(error => {
      this.setState({
        isLoading: false
      });
      showDataFetchError(error.toString());
    });
  };

  render() {
    const {missingDataSource, isLoading, inputPath} = this.state;
    
      const paginationConfig: PaginationConfig = {
        showTotal: (total: number, range) => `${range[0]}-${range[1]} of ${total} missing containers`,
        showSizeChanger: true,
        onShowSizeChange: this.onShowSizeChange
      };
      
      const generateTable = (dataSource) => {
        return <Table
          expandRowByClick dataSource={dataSource}
          columns={this.searchColumn()}
          loading={isLoading}
          pagination={paginationConfig} rowKey='containerID'
          expandedRowRender={this.expandedRowRender} onExpand={this.onRowExpandClick}/>
      }
    
      const menuCount = (
        <Menu onClick={e => this.updateDisplayLimit(e)}>
          <Menu.Item key='10'>
            10
          </Menu.Item>
          <Menu.Item key='20'>
            20
          </Menu.Item>
          <Menu.Item key='30'>
            30
          </Menu.Item>
          <Menu.Item key='40'>
            40
          </Menu.Item>
          <Menu.Item key='50'>
            50
          </Menu.Item>
        </Menu>
      );
      
      const menu = (
        <Menu onClick={e => this.updateDisplayLimit(e)}>
          <Menu.Item key='size'>
            Size
          </Menu.Item>
          <Menu.Item key='count'>
            Count
          </Menu.Item>
        </Menu>
      );
    
    return (
      <div className='metrics-container'>
        <div className='page-header'>
          Metrics
        </div>
        <div className='content-div'>
          {isLoading ? <span><Icon type='loading' /> Loading...</span> :
            (
              <div>
                <Row>
                  <div className='go-back-button'>
                    <Button type='primary' onClick={e => this.goBack(e, returnPath)}><Icon type='left' /></Button>
                  </div>
                  <div className='input-bar'>
                    <h4>Path</h4>
                    <form className='input' id='input-form' onSubmit={this.handleSubmit}>
                      <Input placeholder='/' value={inputPath} onChange={this.handleChange} />
                    </form>
                  </div>
                  <div className='go-back-button'>
                    <Button type='primary' onClick={e => this.refreshCurPath(e, returnPath)}><Icon type='redo' /></Button>
                  </div>
                  <div className='dropdown-button'>
                    <Dropdown overlay={menu} placement='bottomCenter'>
                      <Button>Order By Size/Count</Button>
                    </Dropdown>
                  </div>
                  <div className='dropdown-button'>
                    <Dropdown overlay={menuCount} placement='bottomCenter'>
                      <Button>Count</Button>
                    </Dropdown>
                  </div>
                </Row>
                <Row>
                  {(missingDataSource && missingDataSource.length > 0) ?
                    <div className='content-div'>
                      <Tabs defaultActiveKey='1'>
                        <TabPane key='1' tab={`Missing${(missingDataSource && missingDataSource.length > 0) ? ` (${missingDataSource.length})` : ''}`}>
                          {generateTable(missingDataSource)}
                        </TabPane>
                      </Tabs>
                    </div> :
                    <div>No data for Matrics</div>}
                </Row>
              </div>
            )}
        </div>
      </div>
    );
  }
}
